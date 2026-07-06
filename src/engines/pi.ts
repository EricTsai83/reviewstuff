import { agentLoop } from "@earendil-works/pi-agent-core"
import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core"
import { builtinModels } from "@earendil-works/pi-ai/providers/all"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { EngineAuthError, EngineFailed, SchemaParseError } from "../domain/errors.ts"
import type { EngineError } from "../domain/errors.ts"
import { ReviewerOutput } from "../domain/finding.ts"
import { resolveOAuthApiKey } from "./auth.ts"
import type { ReviewEngine, ReviewRequest, ReviewUsage } from "./engine.ts"
import { buildUserPrompt } from "./engine.ts"
import { FINDINGS_TOOL_SCHEMA } from "./findings-schema.ts"

/** pi API 只准出現在這個檔案。 */

interface RawRunResult {
  readonly recorded: unknown
  readonly usage: ReviewUsage
}

const runPiReview = async (
  request: ReviewRequest,
  apiKey: string,
  signal: AbortSignal
): Promise<RawRunResult> => {
  const models = builtinModels()
  const { provider, modelId } = request.reviewer.model
  const model = models.getModel(provider, modelId)
  if (!model) {
    const available = models.getModels(provider).map((candidate) => candidate.id).slice(0, 10)
    throw new EngineFailed({
      engine: "pi",
      reviewer: request.reviewer.id,
      message: `模型 "${modelId}" 不在 provider "${provider}"（可用：${available.join(", ") || "無"}）`,
      retryable: false
    })
  }

  let recorded: unknown = null

  const recordFindings: AgentTool<typeof FINDINGS_TOOL_SCHEMA> = {
    name: "record_findings",
    label: "Record Findings",
    description:
      "Record the final structured code-review findings. MUST be called exactly once at the end of the review.",
    parameters: FINDINGS_TOOL_SCHEMA,
    execute: async (_toolCallId, params) => {
      recorded = params
      return { content: [{ type: "text", text: "findings recorded" }], details: params }
    }
  }

  const prompts: AgentMessage[] = [
    { role: "user", content: buildUserPrompt(request), timestamp: Date.now() }
  ]

  const usage: { inputTokens: number; outputTokens: number; costUsd: number } = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0
  }

  const events = agentLoop(
    prompts,
    {
      systemPrompt: request.reviewer.systemPrompt,
      messages: [],
      tools: [recordFindings]
    },
    {
      model,
      convertToLlm: (messages) =>
        messages.filter(
          (message) =>
            message.role === "user" || message.role === "assistant" || message.role === "toolResult"
        ),
      getApiKey: () => apiKey
    },
    signal
  )

  for await (const event of events) {
    if (event.type === "message_end" && event.message.role === "assistant") {
      const messageUsage = event.message.usage
      usage.inputTokens += messageUsage?.input ?? 0
      usage.outputTokens += messageUsage?.output ?? 0
      usage.costUsd += messageUsage?.cost?.total ?? 0
    }
  }

  return { recorded, usage }
}

const isAuthLike = (message: string): boolean => /401|403|unauthorized|forbidden|invalid[_ ]?(api[_ ]?key|token)/i.test(message)

export const PiEngine: ReviewEngine = {
  id: "pi",
  review: (request) =>
    Effect.gen(function* () {
      const provider = request.reviewer.model.provider
      const apiKey = yield* resolveOAuthApiKey("pi", provider)

      const raw = yield* Effect.tryPromise({
        try: (signal) => runPiReview(request, apiKey, signal),
        catch: (error): EngineError => {
          if (error instanceof EngineFailed || error instanceof EngineAuthError) return error
          const message = error instanceof Error ? error.message : String(error)
          if (isAuthLike(message)) {
            return new EngineAuthError({ engine: "pi", provider, message })
          }
          return new EngineFailed({
            engine: "pi",
            reviewer: request.reviewer.id,
            message,
            retryable: true,
            cause: error
          })
        }
      })

      if (raw.recorded === null) {
        return yield* Effect.fail(
          new EngineFailed({
            engine: "pi",
            reviewer: request.reviewer.id,
            message: "模型沒有呼叫 record_findings",
            retryable: true
          })
        )
      }

      const output = yield* Schema.decodeUnknownEffect(ReviewerOutput)(raw.recorded).pipe(
        Effect.mapError(
          (error) =>
            new SchemaParseError({
              engine: "pi",
              reviewer: request.reviewer.id,
              message: `findings 結構驗證失敗：${String(error)}`
            })
        )
      )

      return { output, usage: raw.usage }
    })
}

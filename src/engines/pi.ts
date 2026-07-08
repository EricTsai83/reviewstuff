import { agentLoop } from "@earendil-works/pi-agent-core"
import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core"
import type { TSchema } from "@earendil-works/pi-ai"
import { builtinModels } from "@earendil-works/pi-ai/providers/all"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { EngineAuthError, EngineFailed, SchemaParseError } from "../domain/errors.ts"
import type { EngineError } from "../domain/errors.ts"
import { ReviewerOutput } from "../domain/finding.ts"
import { FixOutput } from "../domain/fix.ts"
import type { ModelRef } from "../reviewers/registry.ts"
import { resolveOAuthApiKey } from "./auth.ts"
import type { FixRequest, FixResult, ReviewEngine, ReviewRequest, ReviewResult, ReviewUsage } from "./engine.ts"
import { buildUserPrompt, FIX_SYSTEM_PROMPT } from "./engine.ts"
import { FINDINGS_TOOL_SCHEMA } from "./findings-schema.ts"
import { FIXES_TOOL_SCHEMA } from "./fix-schema.ts"

/** pi API 只准出現在這個檔案。 */

interface RawRunResult {
  readonly recorded: unknown
  readonly usage: ReviewUsage
}

interface PiToolSpec {
  readonly label: string
  readonly name: string
  readonly description: string
  readonly parameters: TSchema
}

/** 通用：跑一次 agent loop，強制模型呼叫指定工具、回傳記錄的結構化參數。 */
const runPiTool = async (
  args: {
    readonly model: ModelRef
    readonly systemPrompt: string
    readonly userContent: string
    readonly tool: PiToolSpec
    readonly reviewerId: string
  },
  apiKey: string,
  signal: AbortSignal
): Promise<RawRunResult> => {
  const models = builtinModels()
  const { provider, modelId } = args.model
  const model = models.getModel(provider, modelId)
  if (!model) {
    const available = models.getModels(provider).map((candidate) => candidate.id).slice(0, 10)
    throw new EngineFailed({
      engine: "pi",
      reviewer: args.reviewerId,
      message: `模型 "${modelId}" 不在 provider "${provider}"（可用：${available.join(", ") || "無"}）`,
      retryable: false
    })
  }

  let recorded: unknown = null

  const tool: AgentTool<TSchema> = {
    name: args.tool.name,
    label: args.tool.label,
    description: args.tool.description,
    parameters: args.tool.parameters,
    execute: async (_toolCallId, params) => {
      recorded = params
      return { content: [{ type: "text", text: `${args.tool.name} recorded` }], details: params }
    }
  }

  const prompts: AgentMessage[] = [{ role: "user", content: args.userContent, timestamp: Date.now() }]
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 }

  const events = agentLoop(
    prompts,
    { systemPrompt: args.systemPrompt, messages: [], tools: [tool] },
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

const isAuthLike = (message: string): boolean =>
  /401|403|unauthorized|forbidden|invalid[_ ]?(api[_ ]?key|token)/i.test(message)

/** 把 tool 呼叫的錯誤映射成 EngineError。 */
const mapPiError = (reviewerId: string, provider: string) => (error: unknown): EngineError => {
  if (error instanceof EngineFailed || error instanceof EngineAuthError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (isAuthLike(message)) return new EngineAuthError({ engine: "pi", provider, message })
  return new EngineFailed({ engine: "pi", reviewer: reviewerId, message, retryable: true, cause: error })
}

export const PiEngine: ReviewEngine = {
  id: "pi",
  review: (request: ReviewRequest) =>
    Effect.gen(function* () {
      const provider = request.reviewer.model.provider
      const apiKey = yield* resolveOAuthApiKey("pi", provider)

      const raw = yield* Effect.tryPromise({
        try: (signal) =>
          runPiTool(
            {
              model: request.reviewer.model,
              systemPrompt: request.reviewer.systemPrompt,
              userContent: buildUserPrompt(request),
              reviewerId: request.reviewer.id,
              tool: {
                name: "record_findings",
                label: "Record Findings",
                description:
                  "Record the final structured code-review findings. MUST be called exactly once at the end of the review.",
                parameters: FINDINGS_TOOL_SCHEMA
              }
            },
            apiKey,
            signal
          ),
        catch: mapPiError(request.reviewer.id, provider)
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
    }),

  generateFixes: (request: FixRequest) =>
    Effect.gen(function* () {
      const provider = request.model.provider
      const apiKey = yield* resolveOAuthApiKey("pi", provider)

      const raw = yield* Effect.tryPromise({
        try: (signal) =>
          runPiTool(
            {
              model: request.model,
              systemPrompt: FIX_SYSTEM_PROMPT,
              userContent: request.userContent,
              reviewerId: "fix",
              tool: {
                name: "record_fixes",
                label: "Record Fixes",
                description: "Record corrected full file contents. MUST be called exactly once.",
                parameters: FIXES_TOOL_SCHEMA
              }
            },
            apiKey,
            signal
          ),
        catch: mapPiError("fix", provider)
      })

      if (raw.recorded === null) {
        return yield* Effect.fail(
          new EngineFailed({ engine: "pi", reviewer: "fix", message: "模型沒有呼叫 record_fixes", retryable: true })
        )
      }

      const output = yield* Schema.decodeUnknownEffect(FixOutput)(raw.recorded).pipe(
        Effect.mapError(
          (error) =>
            new SchemaParseError({ engine: "pi", reviewer: "fix", message: `fixes 結構驗證失敗：${String(error)}` })
        )
      )

      return { output, usage: raw.usage }
    })
}

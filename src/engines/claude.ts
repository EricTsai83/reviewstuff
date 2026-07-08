import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { EngineAuthError, EngineFailed, EngineTimeout, SchemaParseError } from "../domain/errors.ts"
import type { EngineError } from "../domain/errors.ts"
import { ReviewerOutput } from "../domain/finding.ts"
import { FixOutput } from "../domain/fix.ts"
import { runCommand } from "../shared/exec.ts"
import type { FixRequest, FixResult, ReviewEngine, ReviewRequest, ReviewResult, ReviewUsage } from "./engine.ts"
import { FIX_SYSTEM_PROMPT } from "./engine.ts"
import { FINDINGS_JSON_SCHEMA_STRING } from "./findings-schema.ts"
import { FIXES_JSON_SCHEMA_STRING } from "./fix-schema.ts"

/** claude CLI 的 flag 只准出現在這個檔案。注意：訂閱 OAuth 需要 keychain，不可用 --bare。 */

interface ClaudeEnvelope {
  readonly is_error?: boolean
  readonly result?: string
  readonly structured_output?: unknown
  readonly total_cost_usd?: number
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number }
  readonly api_error_status?: number | null
}

const isAuthLike = (text: string): boolean =>
  /not logged in|login|authenticat|unauthorized|401|invalid api key|billing/i.test(text)

/** 通用：claude -p + --json-schema，回傳 envelope.structured_output（未 decode）。 */
const runClaude = (args: {
  readonly reviewerId: string
  readonly systemPrompt: string
  readonly jsonSchema: string
  readonly modelId: string
  readonly stdin: string
  readonly timeoutMs: number
}): Effect.Effect<{ readonly structured: unknown; readonly usage: ReviewUsage }, EngineError> =>
  Effect.gen(function* () {
    const result = yield* runCommand(
      "claude",
      [
        "-p",
        args.systemPrompt,
        "--output-format",
        "json",
        "--json-schema",
        args.jsonSchema,
        "--model",
        args.modelId,
        "--permission-mode",
        "dontAsk"
      ],
      { stdin: args.stdin, timeoutMs: args.timeoutMs }
    ).pipe(
      Effect.mapError((error): EngineError => {
        const cause = error.cause
        if (cause && typeof cause === "object" && (cause as NodeJS.ErrnoException).code === "ENOENT") {
          return new EngineFailed({
            engine: "claude",
            reviewer: args.reviewerId,
            message: "找不到 claude CLI——請先安裝並登入 Claude Code",
            retryable: false
          })
        }
        if (cause && typeof cause === "object" && (cause as { killed?: boolean }).killed) {
          return new EngineTimeout({ engine: "claude", reviewer: args.reviewerId, timeoutMs: args.timeoutMs })
        }
        return new EngineFailed({ engine: "claude", reviewer: args.reviewerId, message: String(cause), retryable: true, cause })
      })
    )

    if (result.exitCode !== 0) {
      const text = `${result.stderr}\n${result.stdout}`.trim()
      if (isAuthLike(text)) {
        return yield* Effect.fail(
          new EngineAuthError({ engine: "claude", provider: "anthropic", message: `claude CLI 認證失敗：${text.slice(0, 300)}` })
        )
      }
      return yield* Effect.fail(
        new EngineFailed({
          engine: "claude",
          reviewer: args.reviewerId,
          message: `claude -p 失敗（exit ${result.exitCode}）：${text.slice(0, 300)}`,
          retryable: true
        })
      )
    }

    let envelope: ClaudeEnvelope
    try {
      envelope = JSON.parse(result.stdout) as ClaudeEnvelope
    } catch {
      return yield* Effect.fail(
        new SchemaParseError({ engine: "claude", reviewer: args.reviewerId, message: `claude 輸出不是 JSON：${result.stdout.slice(0, 200)}` })
      )
    }

    if (envelope.is_error) {
      const text = envelope.result ?? ""
      if (isAuthLike(text) || envelope.api_error_status === 401) {
        return yield* Effect.fail(new EngineAuthError({ engine: "claude", provider: "anthropic", message: text.slice(0, 300) }))
      }
      return yield* Effect.fail(
        new EngineFailed({ engine: "claude", reviewer: args.reviewerId, message: `claude 回報錯誤：${text.slice(0, 300)}`, retryable: true })
      )
    }

    return {
      structured: envelope.structured_output,
      usage: {
        inputTokens: envelope.usage?.input_tokens,
        outputTokens: envelope.usage?.output_tokens,
        costUsd: envelope.total_cost_usd
      }
    }
  })

export const ClaudeEngine: ReviewEngine = {
  id: "claude",
  review: (request: ReviewRequest) =>
    Effect.gen(function* () {
      const systemPrompt = [
        request.reviewer.systemPrompt,
        request.contextText.trim() ? `Project context:\n${request.contextText.trim()}` : "",
        "Review the diff piped via stdin and produce findings in the required structured output format."
      ]
        .filter(Boolean)
        .join("\n\n")

      const { structured, usage } = yield* runClaude({
        reviewerId: request.reviewer.id,
        systemPrompt,
        jsonSchema: FINDINGS_JSON_SCHEMA_STRING,
        modelId: request.reviewer.model.modelId,
        stdin: `\`\`\`diff\n${request.diff}\n\`\`\``,
        timeoutMs: request.timeoutMs
      })

      const output = yield* Schema.decodeUnknownEffect(ReviewerOutput)(structured).pipe(
        Effect.mapError(
          (error) =>
            new SchemaParseError({ engine: "claude", reviewer: request.reviewer.id, message: `structured_output 驗證失敗：${String(error)}` })
        )
      )
      return { output, usage } satisfies ReviewResult
    }),

  generateFixes: (request: FixRequest) =>
    Effect.gen(function* () {
      const { structured, usage } = yield* runClaude({
        reviewerId: "fix",
        systemPrompt: FIX_SYSTEM_PROMPT,
        jsonSchema: FIXES_JSON_SCHEMA_STRING,
        modelId: request.model.modelId,
        stdin: request.userContent,
        timeoutMs: request.timeoutMs
      })

      const output = yield* Schema.decodeUnknownEffect(FixOutput)(structured).pipe(
        Effect.mapError(
          (error) => new SchemaParseError({ engine: "claude", reviewer: "fix", message: `fixes 驗證失敗：${String(error)}` })
        )
      )
      return { output, usage } satisfies FixResult
    })
}

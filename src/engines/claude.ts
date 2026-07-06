import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { EngineAuthError, EngineFailed, EngineTimeout, SchemaParseError } from "../domain/errors.ts"
import type { EngineError } from "../domain/errors.ts"
import { ReviewerOutput } from "../domain/finding.ts"
import { runCommand } from "../shared/exec.ts"
import type { ReviewEngine, ReviewUsage } from "./engine.ts"
import { FINDINGS_JSON_SCHEMA_STRING } from "./findings-schema.ts"

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

export const ClaudeEngine: ReviewEngine = {
  id: "claude",
  review: (request) =>
    Effect.gen(function* () {
      const promptArg = [
        request.reviewer.systemPrompt,
        request.contextText.trim() ? `Project context:\n${request.contextText.trim()}` : "",
        "Review the diff piped via stdin and produce findings in the required structured output format."
      ]
        .filter(Boolean)
        .join("\n\n")

      const result = yield* runCommand(
        "claude",
        [
          "-p",
          promptArg,
          "--output-format",
          "json",
          "--json-schema",
          FINDINGS_JSON_SCHEMA_STRING,
          "--model",
          request.reviewer.model.modelId,
          "--permission-mode",
          "dontAsk"
        ],
        {
          stdin: `\`\`\`diff\n${request.diff}\n\`\`\``,
          timeoutMs: request.timeoutMs
        }
      ).pipe(
        Effect.mapError((error): EngineError => {
          const cause = error.cause
          if (cause && typeof cause === "object" && (cause as NodeJS.ErrnoException).code === "ENOENT") {
            return new EngineFailed({
              engine: "claude",
              reviewer: request.reviewer.id,
              message: "找不到 claude CLI——請先安裝並登入 Claude Code",
              retryable: false
            })
          }
          if (cause && typeof cause === "object" && (cause as { killed?: boolean }).killed) {
            return new EngineTimeout({
              engine: "claude",
              reviewer: request.reviewer.id,
              timeoutMs: request.timeoutMs
            })
          }
          return new EngineFailed({
            engine: "claude",
            reviewer: request.reviewer.id,
            message: String(cause),
            retryable: true,
            cause
          })
        })
      )

      if (result.exitCode !== 0) {
        const text = `${result.stderr}\n${result.stdout}`.trim()
        if (isAuthLike(text)) {
          return yield* Effect.fail(
            new EngineAuthError({
              engine: "claude",
              provider: "anthropic",
              message: `claude CLI 認證失敗：${text.slice(0, 300)}`
            })
          )
        }
        return yield* Effect.fail(
          new EngineFailed({
            engine: "claude",
            reviewer: request.reviewer.id,
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
          new SchemaParseError({
            engine: "claude",
            reviewer: request.reviewer.id,
            message: `claude 輸出不是 JSON：${result.stdout.slice(0, 200)}`
          })
        )
      }

      if (envelope.is_error) {
        const text = envelope.result ?? ""
        if (isAuthLike(text) || envelope.api_error_status === 401) {
          return yield* Effect.fail(
            new EngineAuthError({ engine: "claude", provider: "anthropic", message: text.slice(0, 300) })
          )
        }
        return yield* Effect.fail(
          new EngineFailed({
            engine: "claude",
            reviewer: request.reviewer.id,
            message: `claude 回報錯誤：${text.slice(0, 300)}`,
            retryable: true
          })
        )
      }

      const output = yield* Schema.decodeUnknownEffect(ReviewerOutput)(envelope.structured_output).pipe(
        Effect.mapError(
          (error) =>
            new SchemaParseError({
              engine: "claude",
              reviewer: request.reviewer.id,
              message: `structured_output 驗證失敗：${String(error)}`
            })
        )
      )

      const usage: ReviewUsage = {
        inputTokens: envelope.usage?.input_tokens,
        outputTokens: envelope.usage?.output_tokens,
        costUsd: envelope.total_cost_usd
      }

      return { output, usage }
    })
}

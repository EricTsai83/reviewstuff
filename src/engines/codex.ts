import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { EngineAuthError, EngineFailed, EngineTimeout, SchemaParseError } from "../domain/errors.ts"
import type { EngineError } from "../domain/errors.ts"
import { ReviewerOutput } from "../domain/finding.ts"
import { FixOutput } from "../domain/fix.ts"
import type { ModelRef } from "../reviewers/registry.ts"
import { runCommand } from "../shared/exec.ts"
import type { FixRequest, FixResult, ReviewEngine, ReviewRequest, ReviewResult } from "./engine.ts"
import { FIX_SYSTEM_PROMPT } from "./engine.ts"
import { FINDINGS_STRICT_JSON_SCHEMA, stripNullFields } from "./findings-schema.ts"
import { FIXES_STRICT_JSON_SCHEMA } from "./fix-schema.ts"

/** codex CLI 的 flag 只准出現在這個檔案。官方 OAuth（codex login，ChatGPT 訂閱）。 */

const isAuthLike = (text: string): boolean =>
  /not logged in|login|authenticat|unauthorized|401|invalid api key|billing|usage limit/i.test(text)

/** 通用：codex exec + strict schema，回傳剝掉 null 的原始輸出物件。 */
const runCodex = (args: {
  readonly reviewerId: string
  readonly model: ModelRef
  readonly systemPrompt: string
  readonly stdin: string
  readonly strictSchema: unknown
  readonly timeoutMs: number
}): Effect.Effect<unknown, EngineError> =>
  Effect.suspend(() => {
    const { provider, modelId } = args.model
    if (provider !== "openai-codex" && provider !== "openai") {
      return Effect.fail(
        new EngineFailed({
          engine: "codex",
          reviewer: args.reviewerId,
          message: `codex 引擎只支援 openai 系模型（收到 ${provider}/${modelId}）`,
          retryable: false
        })
      )
    }

    const workDir = mkdtempSync(path.join(os.tmpdir(), "reviewstuff-codex-"))
    return runCodexInDir(args, workDir).pipe(
      Effect.ensuring(Effect.sync(() => rmSync(workDir, { recursive: true, force: true })))
    )
  })

const runCodexInDir = (
  args: {
    readonly reviewerId: string
    readonly model: ModelRef
    readonly systemPrompt: string
    readonly stdin: string
    readonly strictSchema: unknown
    readonly timeoutMs: number
  },
  workDir: string
): Effect.Effect<unknown, EngineError> =>
  Effect.gen(function* () {
    const schemaFile = path.join(workDir, "schema.json")
    const outFile = path.join(workDir, "out.json")
    writeFileSync(schemaFile, JSON.stringify(args.strictSchema))

    const result = yield* runCommand(
      "codex",
      [
        "exec",
        args.systemPrompt,
        "--output-schema",
        schemaFile,
        "-o",
        outFile,
        "-m",
        args.model.modelId,
        "-s",
        "read-only",
        "--skip-git-repo-check"
      ],
      { stdin: args.stdin, timeoutMs: args.timeoutMs }
    ).pipe(
      Effect.mapError((error): EngineError => {
        const cause = error.cause
        if (cause && typeof cause === "object" && (cause as NodeJS.ErrnoException).code === "ENOENT") {
          return new EngineFailed({
            engine: "codex",
            reviewer: args.reviewerId,
            message: "找不到 codex CLI——請先安裝並 codex login",
            retryable: false
          })
        }
        if (cause && typeof cause === "object" && (cause as { killed?: boolean }).killed) {
          return new EngineTimeout({ engine: "codex", reviewer: args.reviewerId, timeoutMs: args.timeoutMs })
        }
        return new EngineFailed({ engine: "codex", reviewer: args.reviewerId, message: String(cause), retryable: true, cause })
      })
    )

    if (result.exitCode !== 0) {
      const text = `${result.stderr}\n${result.stdout}`.trim()
      if (isAuthLike(text)) {
        return yield* Effect.fail(
          new EngineAuthError({ engine: "codex", provider: "openai-codex", message: `codex CLI 認證失敗：${text.slice(0, 300)}` })
        )
      }
      return yield* Effect.fail(
        new EngineFailed({
          engine: "codex",
          reviewer: args.reviewerId,
          message: `codex exec 失敗（exit ${result.exitCode}）：${text.slice(0, 300)}`,
          retryable: true
        })
      )
    }

    let rawOutput: unknown
    try {
      rawOutput = JSON.parse(readFileSync(outFile, "utf8"))
    } catch {
      return yield* Effect.fail(
        new SchemaParseError({ engine: "codex", reviewer: args.reviewerId, message: `codex 最終訊息不是 JSON：${result.stdout.slice(-200)}` })
      )
    }

    return stripNullFields(rawOutput)
  })

export const CodexEngine: ReviewEngine = {
  id: "codex",
  review: (request: ReviewRequest) =>
    Effect.gen(function* () {
      const systemPrompt = [
        request.reviewer.systemPrompt,
        request.contextText.trim() ? `Project context:\n${request.contextText.trim()}` : "",
        "Review the diff provided via stdin and produce findings in the required structured output format."
      ]
        .filter(Boolean)
        .join("\n\n")

      const raw = yield* runCodex({
        reviewerId: request.reviewer.id,
        model: request.reviewer.model,
        systemPrompt,
        stdin: `\`\`\`diff\n${request.diff}\n\`\`\``,
        strictSchema: FINDINGS_STRICT_JSON_SCHEMA,
        timeoutMs: request.timeoutMs
      })

      const output = yield* Schema.decodeUnknownEffect(ReviewerOutput)(raw).pipe(
        Effect.mapError(
          (error) =>
            new SchemaParseError({ engine: "codex", reviewer: request.reviewer.id, message: `findings 結構驗證失敗：${String(error)}` })
        )
      )
      return { output } satisfies ReviewResult
    }),

  generateFixes: (request: FixRequest) =>
    Effect.gen(function* () {
      const raw = yield* runCodex({
        reviewerId: "fix",
        model: request.model,
        systemPrompt: FIX_SYSTEM_PROMPT,
        stdin: request.userContent,
        strictSchema: FIXES_STRICT_JSON_SCHEMA,
        timeoutMs: request.timeoutMs
      })

      const output = yield* Schema.decodeUnknownEffect(FixOutput)(raw).pipe(
        Effect.mapError(
          (error) => new SchemaParseError({ engine: "codex", reviewer: "fix", message: `fixes 結構驗證失敗：${String(error)}` })
        )
      )
      return { output } satisfies FixResult
    })
}

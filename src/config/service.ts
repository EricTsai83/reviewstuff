import { readFileSync } from "node:fs"
import path from "node:path"

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { ConfigError } from "../domain/errors.ts"
import type { FailOn } from "../domain/report.ts"
import type { EngineId, ResolvedReviewer } from "../reviewers/registry.ts"
import { BUILTIN_REVIEWERS, parseModelRef, routeEngine } from "../reviewers/registry.ts"
import type { FileConfig } from "./schema.ts"
import { FileConfig as FileConfigSchema } from "./schema.ts"

export const DEFAULT_CONFIG_FILENAME = "ai-review.config.json"

export interface RunDefaults {
  readonly concurrency: number
  readonly timeoutMs: number
  readonly failOn: FailOn
  readonly rulesFile: string | undefined
}

export const DEFAULTS: RunDefaults = {
  concurrency: 3,
  timeoutMs: 180_000,
  failOn: "error",
  rulesFile: ".ai-review/rules.md"
}

/** 讀取設定檔：指定路徑必須存在；預設路徑不存在時回空設定。 */
export const loadFileConfig = (options: {
  readonly cwd: string
  readonly configPath?: string
}): Effect.Effect<FileConfig, ConfigError> =>
  Effect.gen(function* () {
    const explicit = options.configPath !== undefined
    const filePath = path.resolve(options.cwd, options.configPath ?? DEFAULT_CONFIG_FILENAME)

    let raw: string
    try {
      raw = readFileSync(filePath, "utf8")
    } catch {
      if (explicit) {
        return yield* Effect.fail(new ConfigError({ message: `設定檔不存在：${filePath}` }))
      }
      return {}
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (cause) {
      return yield* Effect.fail(new ConfigError({ message: `設定檔不是合法 JSON：${filePath}`, cause }))
    }

    return yield* Schema.decodeUnknownEffect(FileConfigSchema)(parsed).pipe(
      Effect.mapError((error) => new ConfigError({ message: `設定檔格式錯誤：${String(error)}` }))
    )
  })

export interface RunFlags {
  readonly reviewers?: readonly string[]
  readonly model?: string
  readonly engine?: EngineId
  readonly concurrency?: number
  readonly timeoutSeconds?: number
  readonly failOn?: FailOn
}

export interface ResolvedRun {
  readonly reviewers: readonly ResolvedReviewer[]
  readonly defaults: RunDefaults
}

/** 純函式：registry 預設 + 檔案設定 + CLI flags → 這一輪要跑的 reviewers 與參數。 */
export const resolveRun = (
  fileConfig: FileConfig,
  flags: RunFlags,
  changedFiles: readonly string[]
): Effect.Effect<ResolvedRun, ConfigError> =>
  Effect.gen(function* () {
    const requested = flags.reviewers
    const unknown = requested?.filter((id) => !BUILTIN_REVIEWERS.some((def) => def.id === id)) ?? []
    if (unknown.length > 0) {
      return yield* Effect.fail(
        new ConfigError({
          message: `未知的 reviewer：${unknown.join(", ")}（可用：${BUILTIN_REVIEWERS.map((d) => d.id).join(", ")}）`
        })
      )
    }

    const reviewers: ResolvedReviewer[] = []
    for (const def of BUILTIN_REVIEWERS) {
      const override = fileConfig.reviewers?.[def.id]
      const enabled = requested ? requested.includes(def.id) : (override?.enabled ?? true)
      if (!enabled) continue
      if (!requested && !def.appliesTo(changedFiles)) continue

      const modelString = flags.model ?? override?.model ?? def.defaultModel
      const model = parseModelRef(modelString)
      if (!model) {
        return yield* Effect.fail(
          new ConfigError({ message: `模型格式錯誤："${modelString}"（需要 provider/modelId）` })
        )
      }

      reviewers.push({
        id: def.id,
        systemPrompt: def.systemPrompt,
        model,
        engine: routeEngine(model, flags.engine ?? override?.engine)
      })
    }

    return {
      reviewers,
      defaults: {
        concurrency: flags.concurrency ?? fileConfig.concurrency ?? DEFAULTS.concurrency,
        timeoutMs: (flags.timeoutSeconds ?? fileConfig.timeoutSeconds) !== undefined
          ? (flags.timeoutSeconds ?? fileConfig.timeoutSeconds)! * 1000
          : DEFAULTS.timeoutMs,
        failOn: flags.failOn ?? fileConfig.failOn ?? DEFAULTS.failOn,
        rulesFile: fileConfig.rulesFile ?? DEFAULTS.rulesFile
      }
    }
  })

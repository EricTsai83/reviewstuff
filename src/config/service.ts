import { readFileSync } from "node:fs"
import path from "node:path"

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { ConfigError } from "../domain/errors.ts"
import type { FailOn } from "../domain/report.ts"
import type { EngineId, ModelRef, ProjectInfo, ResolvedReviewer } from "../reviewers/registry.ts"
import { BUILTIN_REVIEWERS, parseModelRef, routeEngine } from "../reviewers/registry.ts"
import { QUICK_PROMPT } from "../reviewers/prompts/quick.ts"
import type { FileConfig } from "./schema.ts"
import { FileConfig as FileConfigSchema } from "./schema.ts"

export type Profile = "quick" | "standard" | "thorough"

const DEFAULT_QUICK_MODEL = "openai-codex/gpt-5.5"
const DEFAULT_VERIFY_MODEL = "openai-codex/gpt-5.4-mini"

/** thorough 雙模型互審：另一家的對照模型。 */
const alternateModel = (model: ModelRef): ModelRef =>
  model.provider === "anthropic"
    ? { provider: "openai-codex", modelId: "gpt-5.5" }
    : { provider: "anthropic", modelId: "claude-sonnet-5" }

export const DEFAULT_CONFIG_FILENAME = "reviewstuff.config.json"

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
  rulesFile: ".reviewstuff/rules.md"
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
  readonly profile?: Profile
  readonly reviewers?: readonly string[]
  readonly model?: string
  readonly engine?: EngineId
  readonly verify?: boolean
  readonly concurrency?: number
  readonly timeoutSeconds?: number
  readonly failOn?: FailOn
}

export interface ResolvedRun {
  readonly profile: Profile
  readonly reviewers: readonly ResolvedReviewer[]
  readonly verify: { readonly model: ModelRef; readonly engine: EngineId } | undefined
  readonly defaults: RunDefaults
}

const NO_PROJECT_INFO: ProjectInfo = { frameworks: [] }

interface CustomReviewerDef {
  readonly id: string
  readonly systemPrompt: string
  readonly defaultModel: string
  readonly engine?: EngineId
}

/** 讀取 config 裡非內建 id 的自訂 reviewer（讀 prompt 檔）。 */
const loadCustomReviewers = (
  fileConfig: FileConfig,
  repoRoot: string
): Effect.Effect<readonly CustomReviewerDef[], ConfigError> =>
  Effect.gen(function* () {
    const entries = Object.entries(fileConfig.reviewers ?? {}).filter(
      ([id]) => !BUILTIN_REVIEWERS.some((def) => def.id === id)
    )
    const customs: CustomReviewerDef[] = []
    for (const [id, config] of entries) {
      if (!config.prompt) {
        return yield* Effect.fail(
          new ConfigError({ message: `自訂 reviewer "${id}" 必須指定 prompt 檔（reviewers.${id}.prompt）` })
        )
      }
      let systemPrompt: string
      try {
        systemPrompt = readFileSync(path.resolve(repoRoot, config.prompt), "utf8").trim()
      } catch {
        return yield* Effect.fail(
          new ConfigError({ message: `自訂 reviewer "${id}" 的 prompt 檔讀不到：${config.prompt}` })
        )
      }
      if (!systemPrompt) {
        return yield* Effect.fail(new ConfigError({ message: `自訂 reviewer "${id}" 的 prompt 檔是空的` }))
      }
      customs.push({
        id,
        systemPrompt,
        defaultModel: config.model ?? "openai-codex/gpt-5.5",
        engine: config.engine
      })
    }
    return customs
  })

/** registry 預設 + 檔案設定（含自訂 reviewer）+ CLI flags → 這一輪要跑的 reviewers 與參數。 */
export const resolveRun = (
  fileConfig: FileConfig,
  flags: RunFlags,
  changedFiles: readonly string[],
  projectInfo: ProjectInfo = NO_PROJECT_INFO,
  repoRoot: string = process.cwd()
): Effect.Effect<ResolvedRun, ConfigError> =>
  Effect.gen(function* () {
    const customReviewers = yield* loadCustomReviewers(fileConfig, repoRoot)
    const knownIds = new Set([...BUILTIN_REVIEWERS.map((def) => def.id), ...customReviewers.map((def) => def.id)])

    const requested = flags.reviewers
    const unknown = requested?.filter((id) => !knownIds.has(id)) ?? []
    if (unknown.length > 0) {
      return yield* Effect.fail(
        new ConfigError({
          message: `未知的 reviewer：${unknown.join(", ")}（可用：${[...knownIds].join(", ")}）`
        })
      )
    }

    const profile: Profile = flags.profile ?? fileConfig.profile ?? "standard"

    let reviewers: ResolvedReviewer[] = []

    if (profile === "quick" && !requested) {
      const modelString = flags.model ?? DEFAULT_QUICK_MODEL
      const model = parseModelRef(modelString)
      if (!model) {
        return yield* Effect.fail(
          new ConfigError({ message: `模型格式錯誤："${modelString}"（需要 provider/modelId）` })
        )
      }
      reviewers.push({
        id: "quick",
        systemPrompt: QUICK_PROMPT,
        model,
        engine: routeEngine(model, flags.engine)
      })
    } else {
      for (const def of BUILTIN_REVIEWERS) {
        const override = fileConfig.reviewers?.[def.id]
        const enabled = requested
          ? requested.includes(def.id)
          : (override?.enabled ?? (profile === "thorough" ? true : def.defaultEnabled))
        if (!enabled) continue
        if (!requested && !def.appliesTo(changedFiles)) continue

        // 需要專案資訊的 reviewer（如 framework）：算不出 prompt 就跳過
        const systemPrompt = def.promptFor ? def.promptFor(projectInfo) : def.systemPrompt
        if (systemPrompt === undefined) continue

        const modelString = flags.model ?? override?.model ?? def.defaultModel
        const model = parseModelRef(modelString)
        if (!model) {
          return yield* Effect.fail(
            new ConfigError({ message: `模型格式錯誤："${modelString}"（需要 provider/modelId）` })
          )
        }

        reviewers.push({
          id: def.id,
          systemPrompt,
          model,
          engine: routeEngine(model, flags.engine ?? override?.engine)
        })
      }

      // 自訂 reviewer（config 裡非內建 id + prompt 檔）
      for (const def of customReviewers) {
        if (requested && !requested.includes(def.id)) continue
        const modelString = flags.model ?? def.defaultModel
        const model = parseModelRef(modelString)
        if (!model) {
          return yield* Effect.fail(
            new ConfigError({ message: `自訂 reviewer "${def.id}" 模型格式錯誤："${modelString}"` })
          )
        }
        reviewers.push({
          id: def.id,
          systemPrompt: def.systemPrompt,
          model,
          engine: routeEngine(model, flags.engine ?? def.engine)
        })
      }

      // thorough：雙模型互審——每個 reviewer 加開另一家模型的對照實例
      if (profile === "thorough") {
        reviewers = reviewers.flatMap((reviewer) => {
          const alt = alternateModel(reviewer.model)
          if (alt.provider === reviewer.model.provider) return [reviewer]
          return [
            { ...reviewer, id: `${reviewer.id}@${reviewer.model.provider}` },
            {
              id: `${reviewer.id}@${alt.provider}`,
              systemPrompt: reviewer.systemPrompt,
              model: alt,
              engine: routeEngine(alt)
            }
          ]
        })
      }
    }

    // verify：flag > config > profile 預設（thorough 開）
    const verifyEnabled = flags.verify ?? fileConfig.verify?.enabled ?? (profile === "thorough")
    let verify: ResolvedRun["verify"]
    if (verifyEnabled) {
      const verifyModelString = fileConfig.verify?.model ?? DEFAULT_VERIFY_MODEL
      const verifyModel = parseModelRef(verifyModelString)
      if (!verifyModel) {
        return yield* Effect.fail(
          new ConfigError({ message: `verify 模型格式錯誤："${verifyModelString}"` })
        )
      }
      verify = { model: verifyModel, engine: routeEngine(verifyModel) }
    }

    return {
      profile,
      reviewers,
      verify,
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

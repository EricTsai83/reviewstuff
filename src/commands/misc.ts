import { existsSync, writeFileSync } from "node:fs"

import * as Effect from "effect/Effect"
import pc from "picocolors"

import { DEFAULT_CONFIG_FILENAME, loadFileConfig } from "../config/service.ts"
import { loggedInProviders } from "../engines/auth.ts"
import { EXIT_CLEAN, EXIT_USAGE } from "../output/json.ts"
import { BUILTIN_REVIEWERS, parseModelRef, routeEngine } from "../reviewers/registry.ts"

const SAMPLE_CONFIG = {
  concurrency: 3,
  timeoutSeconds: 180,
  failOn: "error",
  rulesFile: ".ai-review/rules.md",
  reviewers: {
    correctness: { model: "openai-codex/gpt-5.5" },
    security: { model: "anthropic/claude-sonnet-5" },
    typescript: { model: "openai-codex/gpt-5.5" }
  }
}

export const initCommand = () =>
  Effect.sync(() => {
    if (existsSync(DEFAULT_CONFIG_FILENAME)) {
      console.error(`${DEFAULT_CONFIG_FILENAME} 已存在，不覆寫。`)
      return EXIT_USAGE
    }
    writeFileSync(DEFAULT_CONFIG_FILENAME, `${JSON.stringify(SAMPLE_CONFIG, null, 2)}\n`)
    console.log(`${pc.green("✓")} 已建立 ${DEFAULT_CONFIG_FILENAME}`)
    console.log(pc.dim("  下一步：ai-review doctor 檢查引擎登入狀態"))
    return EXIT_CLEAN
  })

export const reviewersCommand = (configPath?: string) =>
  Effect.gen(function* () {
    const fileConfig = yield* loadFileConfig({ cwd: process.cwd(), configPath })
    const providers = loggedInProviders()

    console.log(pc.bold("\nreviewers\n"))
    for (const def of BUILTIN_REVIEWERS) {
      const override = fileConfig.reviewers?.[def.id]
      const enabled = override?.enabled ?? true
      const modelString = override?.model ?? def.defaultModel
      const model = parseModelRef(modelString)
      const engine = model ? routeEngine(model, override?.engine) : "?"
      const authOk =
        engine === "claude" || (model !== null && providers.includes(model.provider))

      console.log(
        `  ${enabled ? pc.green("●") : pc.dim("○")} ${def.id.padEnd(12)} ${pc.dim(
          `${modelString} · engine=${engine}${authOk ? "" : " · ⚠ 未登入"}`
        )}`
      )
      console.log(`      ${pc.dim(def.description)}`)
    }
    console.log("")
    return EXIT_CLEAN
  })

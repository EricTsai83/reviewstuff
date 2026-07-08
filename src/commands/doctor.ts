import * as Effect from "effect/Effect"
import pc from "picocolors"

import { AUTH_FILE, hasEnvApiKey, loggedInProviders } from "../engines/auth.ts"
import { GitService } from "../git/service.ts"
import { EXIT_CLEAN, EXIT_USAGE } from "../output/json.ts"
import { BUILTIN_REVIEWERS } from "../reviewers/registry.ts"
import { runCommand } from "../shared/exec.ts"

const ok = (label: string, detail: string) => console.log(`  ${pc.green("✓")} ${label.padEnd(16)} ${pc.dim(detail)}`)
const bad = (label: string, detail: string) => console.log(`  ${pc.red("✗")} ${label.padEnd(16)} ${detail}`)

/** 環境自檢；回傳 exit code（有問題 → 2）。 */
export const doctorCommand = () =>
  Effect.gen(function* () {
    let healthy = true
    console.log(pc.bold("\nreviewstuff doctor\n"))

    // git repo
    const repoRoot = yield* GitService.pipe(
      Effect.flatMap((git) => git.repoRoot),
      Effect.result
    )
    if (repoRoot._tag === "Success") {
      ok("git repo", repoRoot.success)
    } else {
      healthy = false
      bad("git repo", "目前目錄不在 git repo 裡")
    }

    // pi 引擎（訂閱 OAuth）
    const providers = loggedInProviders()
    const wanted = new Set(
      BUILTIN_REVIEWERS.map((def) => def.defaultModel.split("/")[0]).filter(
        (provider): provider is string => provider !== undefined && provider !== "anthropic"
      )
    )
    for (const provider of wanted) {
      if (providers.includes(provider)) {
        ok(`pi:${provider}`, `已登入（${AUTH_FILE}）`)
      } else if (hasEnvApiKey(provider)) {
        ok(`pi:${provider}`, "使用環境變數 API key")
      } else {
        healthy = false
        bad(`pi:${provider}`, `未登入——跑 reviewstuff login ${provider}（或設定 API key 環境變數）`)
      }
    }

    // claude 引擎（官方 CLI）
    const claude = yield* runCommand("claude", ["--version"]).pipe(Effect.result)
    if (claude._tag === "Success" && claude.success.exitCode === 0) {
      ok("claude CLI", claude.success.stdout.trim())
    } else {
      healthy = false
      bad("claude CLI", "找不到 claude——安裝並登入 Claude Code 後 ClaudeEngine 才可用")
    }

    // codex 引擎（官方 CLI，選配）
    const codex = yield* runCommand("codex", ["login", "status"]).pipe(Effect.result)
    if (codex._tag === "Success" && codex.success.exitCode === 0) {
      ok("codex CLI", codex.success.stdout.trim().split("\n")[0] ?? "已登入")
    } else if (codex._tag === "Success") {
      bad("codex CLI", "未登入——codex login 後才可用 --engine codex（選配）")
    } else {
      console.log(`  ${pc.dim("○")} ${"codex CLI".padEnd(16)} ${pc.dim("未安裝（選配引擎）")}`)
    }

    console.log("")
    if (!healthy) console.log(pc.yellow("  部分引擎不可用；可用 --engine 或 --reviewers 避開，或先完成登入。\n"))
    return healthy ? EXIT_CLEAN : EXIT_USAGE
  })

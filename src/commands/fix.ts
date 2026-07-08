import { readFileSync } from "node:fs"
import path from "node:path"

import * as Effect from "effect/Effect"
import pc from "picocolors"

import { loadFileConfig, resolveRun } from "../config/service.ts"
import type { RunFlags } from "../config/service.ts"
import { loadContextText } from "../context/service.ts"
import type { Severity } from "../domain/finding.ts"
import { severityAtLeast } from "../domain/finding.ts"
import type { ReviewScope } from "../domain/scope.ts"
import { Since, Staged, WorkingTree } from "../domain/scope.ts"
import { GitService } from "../git/service.ts"
import { EXIT_CLEAN, EXIT_FINDINGS } from "../output/json.ts"
import { runReviewers } from "../review/orchestrator.ts"
import { applyFixes, generateAndValidateFixes } from "../review/fix.ts"
import type { ProjectInfo } from "../reviewers/registry.ts"
import { detectFrameworks, parseModelRef, routeEngine } from "../reviewers/registry.ts"

export interface FixCliFlags {
  readonly staged?: boolean
  readonly since?: string
  readonly file?: readonly string[]
  readonly model?: string
  readonly engine?: "pi" | "claude" | "codex"
  readonly fixModel?: string
  readonly apply?: boolean
  readonly dryRun?: boolean
  readonly fixSeverity?: Severity
  readonly config?: string
  readonly timeout?: number
  readonly concurrency?: number
}

const DEFAULT_FIX_MODEL = "anthropic/claude-sonnet-5"

export const fixCommand = (flags: FixCliFlags) =>
  Effect.gen(function* () {
    const git = yield* GitService
    const repoRoot = yield* git.repoRoot

    let scope: ReviewScope
    if (flags.since) scope = Since(flags.since)
    else if (flags.staged) scope = Staged
    else {
      const stagedFiles = yield* git.changedFiles(Staged)
      scope = stagedFiles.length > 0 ? Staged : WorkingTree
    }

    const changedFiles = yield* git.changedFiles(scope, flags.file)
    if (changedFiles.length === 0) {
      console.error("沒有可修復的變更。")
      return EXIT_CLEAN
    }

    const diff = yield* git.diffFor(scope, flags.file)
    const fileConfig = yield* loadFileConfig({ cwd: repoRoot, configPath: flags.config })

    const projectInfo: ProjectInfo = yield* Effect.sync(() => {
      try {
        return { frameworks: detectFrameworks(JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"))) }
      } catch {
        return { frameworks: [] }
      }
    })

    const runFlags: RunFlags = {
      model: flags.model,
      engine: flags.engine,
      concurrency: flags.concurrency,
      timeoutSeconds: flags.timeout
    }
    const resolved = yield* resolveRun(fileConfig, runFlags, changedFiles, projectInfo, repoRoot)
    const contextText = yield* loadContextText({ repoRoot, rulesFile: resolved.defaults.rulesFile })

    console.error(`reviewing ${changedFiles.length} file(s) …`)
    const outcome = yield* runReviewers({
      reviewers: resolved.reviewers,
      diff,
      contextText,
      timeoutMs: resolved.defaults.timeoutMs,
      concurrency: resolved.defaults.concurrency
    })

    const threshold: Severity = flags.fixSeverity ?? "error"
    const toFix = outcome.findings.filter((finding) => severityAtLeast(finding.severity, threshold))

    if (toFix.length === 0) {
      console.log(pc.green(`沒有達到 ${threshold} 門檻的 finding，無需修復。`))
      return EXIT_CLEAN
    }

    // fix 模型：--fix-model > --model > 預設；引擎依 provider 路由（--engine 覆寫）
    const fixModelString = flags.fixModel ?? flags.model ?? DEFAULT_FIX_MODEL
    const fixModel = parseModelRef(fixModelString)
    if (!fixModel) {
      console.error(`fix 模型格式錯誤："${fixModelString}"`)
      return EXIT_FINDINGS
    }
    const fixEngine = routeEngine(fixModel, flags.engine)

    console.error(`generating fixes for ${toFix.length} finding(s) with ${fixEngine}:${fixModel.modelId} …`)
    const validation = yield* generateAndValidateFixes({
      repoRoot,
      findings: toFix,
      model: fixModel,
      engine: fixEngine,
      gates: fileConfig.gates ?? {},
      timeoutMs: resolved.defaults.timeoutMs
    })

    if (validation.fixes.length === 0) {
      console.log(pc.yellow("模型沒有產生任何修復。"))
      return EXIT_FINDINGS
    }

    console.log(pc.bold(`\n提議修復 ${validation.fixes.length} 個檔案：\n`))
    for (const fix of validation.fixes) {
      console.log(`  ${pc.underline(fix.file)}`)
      console.log(`    ${pc.dim(fix.explanation)}`)
    }

    if (validation.gates.length > 0) {
      console.log(pc.bold("\n驗證閘門："))
      for (const gate of validation.gates) {
        const icon = gate.passed ? pc.green("✓") : pc.red("✗")
        console.log(`  ${icon} ${gate.name.padEnd(10)} ${pc.dim(gate.command)}`)
        if (!gate.passed) console.log(pc.dim(gate.output.split("\n").map((line) => `      ${line}`).join("\n")))
      }
    } else {
      console.log(pc.dim("\n（未設定 gates，跳過驗證——建議在 reviewstuff.config.json 加 gates.typecheck/test）"))
    }

    console.log("")

    if (flags.dryRun) {
      console.log(pc.dim("--dry-run：不寫入。"))
      return EXIT_FINDINGS
    }

    if (!flags.apply) {
      console.log(pc.dim("預覽模式：加 --apply 套用修復。"))
      return EXIT_FINDINGS
    }

    if (!validation.allGreen) {
      console.log(pc.red("驗證閘門未全綠，拒絕套用（可用 --dry-run 檢視，或修正 gates 後重試）。"))
      return EXIT_FINDINGS
    }

    yield* applyFixes(repoRoot, validation.fixes)
    console.log(pc.green(`✓ 已套用 ${validation.fixes.length} 個檔案的修復到工作目錄。`))
    return EXIT_CLEAN
  })

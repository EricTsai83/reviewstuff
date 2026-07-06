import { writeFileSync } from "node:fs"

import * as Effect from "effect/Effect"

import { loadFileConfig, resolveRun } from "../config/service.ts"
import type { RunFlags } from "../config/service.ts"
import { loadContextText } from "../context/service.ts"
import type { FailOn } from "../domain/report.ts"
import type { ReviewScope } from "../domain/scope.ts"
import { Since, Staged, WorkingTree } from "../domain/scope.ts"
import { GitService } from "../git/service.ts"
import { assembleReport, EXIT_CLEAN, renderJson } from "../output/json.ts"
import { renderTerminal } from "../output/terminal.ts"
import { runReviewers } from "../review/orchestrator.ts"

export interface ReviewCliFlags {
  readonly staged?: boolean
  readonly since?: string
  readonly file?: readonly string[]
  readonly reviewers?: string
  readonly model?: string
  readonly engine?: "pi" | "claude"
  readonly json?: boolean
  readonly output?: string
  readonly failOn?: FailOn
  readonly config?: string
  readonly timeout?: number
  readonly concurrency?: number
}

/** 主流程；回傳 exit code。人話輸出走 stderr（--json 時 stdout 保留給機器）。 */
export const reviewCommand = (flags: ReviewCliFlags) =>
  Effect.gen(function* () {
    const git = yield* GitService
    const startedAt = Date.now()

    const repoRoot = yield* git.repoRoot

    // 範圍：--staged / --since 明確指定；否則有 staged 變更就用 staged，否則 working tree
    let scope: ReviewScope
    if (flags.since) {
      scope = Since(flags.since)
    } else if (flags.staged) {
      scope = Staged
    } else {
      const stagedFiles = yield* git.changedFiles(Staged)
      scope = stagedFiles.length > 0 ? Staged : WorkingTree
    }

    const fileGlobs = flags.file
    const changedFiles = yield* git.changedFiles(scope, fileGlobs)

    if (changedFiles.length === 0) {
      console.error("沒有可 review 的變更。")
      return EXIT_CLEAN
    }

    const diff = yield* git.diffFor(scope, fileGlobs)

    const fileConfig = yield* loadFileConfig({ cwd: repoRoot, configPath: flags.config })
    const runFlags: RunFlags = {
      reviewers: flags.reviewers?.split(",").map((id) => id.trim()).filter(Boolean),
      model: flags.model,
      engine: flags.engine,
      concurrency: flags.concurrency,
      timeoutSeconds: flags.timeout,
      failOn: flags.failOn
    }
    const resolved = yield* resolveRun(fileConfig, runFlags, changedFiles)

    if (resolved.reviewers.length === 0) {
      console.error("沒有啟用的 reviewer。")
      return EXIT_CLEAN
    }

    const contextText = yield* loadContextText({ repoRoot, rulesFile: resolved.defaults.rulesFile })

    console.error(
      `reviewing ${changedFiles.length} file(s) with ${resolved.reviewers
        .map((reviewer) => `${reviewer.id}(${reviewer.engine}:${reviewer.model.modelId})`)
        .join(", ")} …`
    )

    const outcome = yield* runReviewers({
      reviewers: resolved.reviewers,
      diff,
      contextText,
      timeoutMs: resolved.defaults.timeoutMs,
      concurrency: resolved.defaults.concurrency
    })

    const report = assembleReport({
      scope,
      files: changedFiles,
      outcome,
      failOn: resolved.defaults.failOn,
      startedAt
    })

    if (flags.output) {
      writeFileSync(flags.output, `${renderJson(report)}\n`)
    }

    if (flags.json) {
      console.log(renderJson(report))
      console.error(renderTerminal(report))
    } else {
      console.log(renderTerminal(report))
    }

    return report.exitCode
  })

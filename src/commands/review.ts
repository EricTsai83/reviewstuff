import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import * as Effect from "effect/Effect"

import { loadFileConfig, resolveRun } from "../config/service.ts"
import type { Profile, RunFlags } from "../config/service.ts"
import { loadBaseline, partitionByBaseline, saveBaseline } from "../review/baseline.ts"
import { boostCrossModelAgreement } from "../review/dedup.ts"
import { verifyFindings } from "../review/verify.ts"
import { loadContextText } from "../context/service.ts"
import type { FailOn } from "../domain/report.ts"
import type { ReviewScope } from "../domain/scope.ts"
import { Since, Staged, WorkingTree } from "../domain/scope.ts"
import { GitService } from "../git/service.ts"
import { assembleReport, EXIT_CLEAN, renderJson } from "../output/json.ts"
import { renderTerminal } from "../output/terminal.ts"
import { runReviewers } from "../review/orchestrator.ts"
import type { ProjectInfo } from "../reviewers/registry.ts"
import { detectFrameworks } from "../reviewers/registry.ts"

export interface ReviewCliFlags {
  readonly staged?: boolean
  readonly since?: string
  readonly file?: readonly string[]
  readonly profile?: Profile
  readonly reviewers?: string
  readonly model?: string
  readonly engine?: "pi" | "claude" | "codex"
  readonly verify?: boolean
  readonly updateBaseline?: boolean
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
      profile: flags.profile,
      reviewers: flags.reviewers?.split(",").map((id) => id.trim()).filter(Boolean),
      model: flags.model,
      engine: flags.engine,
      verify: flags.verify,
      concurrency: flags.concurrency,
      timeoutSeconds: flags.timeout,
      failOn: flags.failOn
    }
    const projectInfo: ProjectInfo = yield* Effect.sync(() => {
      try {
        return { frameworks: detectFrameworks(JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"))) }
      } catch {
        return { frameworks: [] }
      }
    })
    const resolved = yield* resolveRun(fileConfig, runFlags, changedFiles, projectInfo, repoRoot)

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

    // thorough：跨模型同意的 findings 信心加成
    let findings =
      resolved.profile === "thorough" ? boostCrossModelAgreement(outcome.findings) : [...outcome.findings]
    const reviewerRuns = [...outcome.reviewerRuns]

    // verify pass：便宜模型裁決剔誤報（引擎全掛就不必浪費額度）
    let droppedByVerify = 0
    if (resolved.verify && findings.length > 0 && !outcome.allFailed) {
      console.error(`verifying ${findings.length} finding(s) with ${resolved.verify.model.provider}/${resolved.verify.model.modelId} …`)
      const verified = yield* verifyFindings({
        findings,
        diff,
        model: resolved.verify.model,
        engine: resolved.verify.engine,
        timeoutMs: resolved.defaults.timeoutMs
      })
      findings = verified.kept
      droppedByVerify = verified.droppedCount
      reviewerRuns.push(verified.run)
    }

    // baseline：--update-baseline 寫快照；否則濾掉已知 findings
    const baseline = loadBaseline(repoRoot)
    let suppressedCount = 0
    if (flags.updateBaseline) {
      const baselinePath = saveBaseline(repoRoot, findings)
      console.error(`baseline 已更新（${findings.length} 條 fingerprints）：${baselinePath}`)
    } else if (baseline.size > 0) {
      const partitioned = partitionByBaseline(findings, baseline)
      findings = partitioned.fresh
      suppressedCount = partitioned.suppressed.length
    }

    const report = assembleReport({
      scope,
      files: changedFiles,
      reviewerRuns,
      findings,
      allFailed: outcome.allFailed,
      failOn: resolved.defaults.failOn,
      startedAt,
      suppressedCount,
      droppedByVerify
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

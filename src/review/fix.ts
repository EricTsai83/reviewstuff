import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import * as Effect from "effect/Effect"

import type { GatesConfig } from "../config/schema.ts"
import type { EngineError, GitError } from "../domain/errors.ts"
import type { AggregatedFinding } from "../domain/report.ts"
import type { FileFix } from "../domain/fix.ts"
import { Engines } from "../engines/engine.ts"
import { GitService } from "../git/service.ts"
import type { EngineId, ModelRef } from "../reviewers/registry.ts"
import { runCommand } from "../shared/exec.ts"

export interface GateResult {
  readonly name: string
  readonly command: string
  readonly passed: boolean
  readonly output: string
}

export interface FixValidation {
  readonly fixes: readonly FileFix[]
  readonly gates: readonly GateResult[]
  readonly allGreen: boolean
}

/** 組 fix 提示：findings + 受影響檔案的完整內容。 */
const buildFixPrompt = (repoRoot: string, findings: readonly AggregatedFinding[]): string => {
  const files = [...new Set(findings.map((finding) => finding.file))]
  const fileBlocks = files
    .map((file) => {
      let content: string
      try {
        content = readFileSync(path.join(repoRoot, file), "utf8")
      } catch {
        content = "// (file not found / not readable)"
      }
      return `### ${file}\n\`\`\`\n${content}\n\`\`\``
    })
    .join("\n\n")

  const findingList = findings
    .map(
      (finding, index) =>
        `${index + 1}. [${finding.severity}/${finding.category}] ${finding.file}${
          finding.line ? `:${finding.line}` : ""
        } — ${finding.title}\n   ${finding.rationale}${finding.suggestion ? `\n   suggestion: ${finding.suggestion}` : ""}`
    )
    .join("\n")

  return [
    "Fix the following code-review findings by rewriting the affected files.",
    `## Findings\n${findingList}`,
    `## Current file contents\n${fileBlocks}`,
    "Return full corrected contents for each file you change, via the structured output channel."
  ].join("\n\n")
}

const runGate = (
  name: string,
  command: string,
  cwd: string,
  timeoutMs: number
): Effect.Effect<GateResult> =>
  runCommand("sh", ["-c", command], { cwd, timeoutMs }).pipe(
    Effect.map((result) => ({
      name,
      command,
      passed: result.exitCode === 0,
      output: `${result.stdout}\n${result.stderr}`.trim().slice(-1000)
    })),
    Effect.catchCause(() =>
      Effect.succeed({ name, command, passed: false, output: "gate 無法執行" })
    )
  )

/**
 * 產生修復 → 在暫存 worktree 套用 → 跑閘門驗證。
 * worktree 用 acquireRelease 保證清理；不動使用者的工作目錄。
 */
export const generateAndValidateFixes = (input: {
  readonly repoRoot: string
  readonly findings: readonly AggregatedFinding[]
  readonly model: ModelRef
  readonly engine: EngineId
  readonly gates: GatesConfig
  readonly timeoutMs: number
}): Effect.Effect<FixValidation, EngineError | GitError, Engines | GitService> =>
  Effect.gen(function* () {
    const engines = yield* Engines
    const git = yield* GitService

    const { output } = yield* engines.get(input.engine).generateFixes({
      model: input.model,
      engine: input.engine,
      userContent: buildFixPrompt(input.repoRoot, input.findings),
      timeoutMs: input.timeoutMs
    })

    if (output.fixes.length === 0) {
      return { fixes: [], gates: [], allGreen: false }
    }

    const gateEntries = Object.entries(input.gates).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0
    )

    // 沒設定閘門 → 直接回傳修復（未驗證，allGreen=true 讓 --apply 可用）
    if (gateEntries.length === 0) {
      return { fixes: output.fixes, gates: [], allGreen: true }
    }

    const worktreePath = path.join(os.tmpdir(), `reviewstuff-fix-${process.pid}-${Date.now()}`)

    return yield* Effect.acquireUseRelease(
      git.addWorktree(worktreePath).pipe(Effect.as(worktreePath)),
      () =>
        Effect.gen(function* () {
          // 套用修復到 worktree
          for (const fix of output.fixes) {
            const target = path.join(worktreePath, fix.file)
            mkdirSync(path.dirname(target), { recursive: true })
            writeFileSync(target, fix.content)
          }
          // 依序跑閘門（lint → typecheck → test）
          const gates: GateResult[] = []
          for (const [name, command] of gateEntries) {
            gates.push(yield* runGate(name, command, worktreePath, input.timeoutMs))
          }
          return { fixes: output.fixes, gates, allGreen: gates.every((gate) => gate.passed) }
        }),
      () => git.removeWorktree(worktreePath).pipe(Effect.catchCause(() => Effect.void))
    )
  })

/** 把驗證通過的修復寫回真正的工作目錄。 */
export const applyFixes = (repoRoot: string, fixes: readonly FileFix[]): Effect.Effect<void> =>
  Effect.sync(() => {
    for (const fix of fixes) {
      const target = path.join(repoRoot, fix.file)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, fix.content)
    }
  })

import type { AggregatedFinding, FailOn, Report, ReviewerRun } from "../domain/report.ts"
import { exitCodeFor, summarize } from "../domain/report.ts"
import type { ReviewScope } from "../domain/scope.ts"
import { describeScope } from "../domain/scope.ts"

export const EXIT_CLEAN = 0
export const EXIT_FINDINGS = 1
export const EXIT_USAGE = 2
export const EXIT_RUNTIME = 3

export const assembleReport = (input: {
  readonly scope: ReviewScope
  readonly files: readonly string[]
  readonly reviewerRuns: readonly ReviewerRun[]
  readonly findings: readonly AggregatedFinding[]
  readonly allFailed: boolean
  readonly failOn: FailOn
  readonly startedAt: number
  readonly suppressedCount?: number
  readonly droppedByVerify?: number
}): Report => {
  const exitCode = input.allFailed ? EXIT_RUNTIME : exitCodeFor(input.findings, input.failOn)

  const totalCostUsd = input.reviewerRuns.reduce(
    (total, run) => total + (run.usage?.costUsd ?? 0),
    0
  )

  return {
    version: 1,
    scope: { kind: describeScope(input.scope), files: input.files },
    ranAt: new Date(input.startedAt).toISOString(),
    durationMs: Date.now() - input.startedAt,
    reviewers: input.reviewerRuns,
    findings: input.findings,
    summary: {
      ...summarize(input.findings),
      ...(input.suppressedCount ? { suppressed: input.suppressedCount } : {}),
      ...(input.droppedByVerify ? { droppedByVerify: input.droppedByVerify } : {}),
      ...(totalCostUsd > 0 ? { totalCostUsd: Number(totalCostUsd.toFixed(4)) } : {})
    },
    exitCode
  }
}

export const renderJson = (report: Report): string => JSON.stringify(report, null, 2)

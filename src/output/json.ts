import type { FailOn, Report } from "../domain/report.ts"
import { exitCodeFor, summarize } from "../domain/report.ts"
import type { ReviewScope } from "../domain/scope.ts"
import { describeScope } from "../domain/scope.ts"
import type { ReviewOutcome } from "../review/orchestrator.ts"

export const EXIT_CLEAN = 0
export const EXIT_FINDINGS = 1
export const EXIT_USAGE = 2
export const EXIT_RUNTIME = 3

export const assembleReport = (input: {
  readonly scope: ReviewScope
  readonly files: readonly string[]
  readonly outcome: ReviewOutcome
  readonly failOn: FailOn
  readonly startedAt: number
}): Report => {
  const { outcome } = input
  const exitCode = outcome.allFailed
    ? EXIT_RUNTIME
    : exitCodeFor(outcome.findings, input.failOn)

  return {
    version: 1,
    scope: { kind: describeScope(input.scope), files: input.files },
    ranAt: new Date(input.startedAt).toISOString(),
    durationMs: Date.now() - input.startedAt,
    reviewers: outcome.reviewerRuns,
    findings: outcome.findings,
    summary: summarize(outcome.findings),
    exitCode
  }
}

export const renderJson = (report: Report): string => JSON.stringify(report, null, 2)

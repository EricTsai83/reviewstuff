import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Schedule from "effect/Schedule"

import { EngineFailed, EngineTimeout } from "../domain/errors.ts"
import type { EngineError } from "../domain/errors.ts"
import type { Finding } from "../domain/finding.ts"
import type { AggregatedFinding, ReviewerRun } from "../domain/report.ts"
import { Engines } from "../engines/engine.ts"
import type { ReviewRequest } from "../engines/engine.ts"
import type { ResolvedReviewer } from "../reviewers/registry.ts"
import { formatModelRef } from "../reviewers/registry.ts"
import { dedupeFindings } from "./dedup.ts"

export interface OrchestratorInput {
  readonly reviewers: readonly ResolvedReviewer[]
  readonly diff: string
  readonly contextText: string
  readonly timeoutMs: number
  readonly concurrency: number
}

export interface ReviewOutcome {
  readonly reviewerRuns: readonly ReviewerRun[]
  readonly findings: readonly AggregatedFinding[]
  /** 全部 reviewer 都失敗（且至少有一個 reviewer） */
  readonly allFailed: boolean
}

const RETRY_SCHEDULE = Schedule.exponential("500 millis").pipe(
  Schedule.both(Schedule.recurs(2)),
  Schedule.jittered
)

const statusOf = (error: EngineError): ReviewerRun["status"] =>
  error._tag === "EngineTimeout" ? "timeout" : "failed"

/** app 的心臟：平行 fan-out + 每 reviewer 獨立 timeout/retry/部分失敗。 */
export const runReviewers = (
  input: OrchestratorInput
): Effect.Effect<ReviewOutcome, never, Engines> =>
  Effect.gen(function* () {
    const engines = yield* Engines

    const results = yield* Effect.forEach(
      input.reviewers,
      (reviewer) =>
        Effect.gen(function* () {
          const request: ReviewRequest = {
            reviewer,
            diff: input.diff,
            contextText: input.contextText,
            timeoutMs: input.timeoutMs
          }
          const startedAt = Date.now()

          const outcome = yield* engines.get(reviewer.engine).review(request).pipe(
            Effect.timeout(Duration.millis(input.timeoutMs)),
            Effect.mapError((error) =>
              Cause.isTimeoutError(error)
                ? new EngineTimeout({
                    engine: reviewer.engine,
                    reviewer: reviewer.id,
                    timeoutMs: input.timeoutMs
                  })
                : error
            ),
            Effect.retry({
              schedule: RETRY_SCHEDULE,
              while: (error) => error instanceof EngineFailed && error.retryable
            }),
            Effect.result
          )

          const durationMs = Date.now() - startedAt

          if (Result.isFailure(outcome)) {
            const error = outcome.failure
            const run: ReviewerRun = {
              id: reviewer.id,
              engine: reviewer.engine,
              model: formatModelRef(reviewer.model),
              status: statusOf(error),
              findingCount: 0,
              durationMs,
              error: `${error._tag}: ${"message" in error ? error.message : ""}`
            }
            return { run, findings: [] as readonly Finding[] }
          }

          const { output, usage } = outcome.success
          const run: ReviewerRun = {
            id: reviewer.id,
            engine: reviewer.engine,
            model: formatModelRef(reviewer.model),
            status: "ok",
            findingCount: output.findings.length,
            durationMs,
            ...(usage ? { usage } : {})
          }
          return { run, findings: output.findings }
        }).pipe(Effect.withSpan(`reviewer.${reviewer.id}`)),
      { concurrency: input.concurrency }
    )

    const findings = dedupeFindings(
      results.map((result) => ({ reviewerId: result.run.id, findings: result.findings }))
    )

    const reviewerRuns = results.map((result) => result.run)
    const allFailed = reviewerRuns.length > 0 && reviewerRuns.every((run) => run.status !== "ok")

    return { reviewerRuns, findings, allFailed }
  })

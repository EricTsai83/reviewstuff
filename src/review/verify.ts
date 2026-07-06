import * as Effect from "effect/Effect"
import * as Result from "effect/Result"

import type { AggregatedFinding, ReviewerRun } from "../domain/report.ts"
import { Engines } from "../engines/engine.ts"
import type { EngineId, ModelRef } from "../reviewers/registry.ts"
import { formatModelRef } from "../reviewers/registry.ts"

/**
 * Verify pass：用便宜模型當裁判，逐條裁決 findings 剔除誤報。
 * 裁判透過同一個 ReviewerOutput 結構「重發真 findings、丟掉誤報」——
 * 比對用 (file, line 分桶, category)，跟 fingerprint 同邏輯但不含 title（裁判可能改寫標題）。
 */

const matchKey = (finding: { file: string; line?: number; category: string }): string =>
  [finding.file, Math.floor((finding.line ?? 0) / 5), finding.category].join("|")

const VERIFY_PROMPT = (candidates: readonly AggregatedFinding[]): string =>
  `
You are a skeptical review judge. Below are CANDIDATE findings another reviewer produced for the diff you will receive.
Your job: eliminate false positives.

For each candidate, check against the diff:
1. Does the cited code actually exist in the diff as described?
2. Is the claimed problem real (not defensive speculation, not style preference)?
3. Is the severity justified?

Re-emit ONLY the genuine findings through the structured output channel:
- Keep "file", "line", and "category" IDENTICAL to the candidate you are confirming.
- You may correct severity and rewrite the rationale.
- Set confidence to YOUR OWN judgment (0..1).
- DROP false positives entirely — do not re-emit them.
- Default to dropping when uncertain.

Candidates:
${JSON.stringify(
    candidates.map((candidate) => ({
      file: candidate.file,
      line: candidate.line,
      category: candidate.category,
      severity: candidate.severity,
      title: candidate.title,
      rationale: candidate.rationale
    })),
    null,
    2
  )}
`.trim()

export interface VerifyOutcome {
  readonly kept: AggregatedFinding[]
  readonly droppedCount: number
  readonly run: ReviewerRun
}

export const verifyFindings = (input: {
  readonly findings: readonly AggregatedFinding[]
  readonly diff: string
  readonly model: ModelRef
  readonly engine: EngineId
  readonly timeoutMs: number
}): Effect.Effect<VerifyOutcome, never, Engines> =>
  Effect.gen(function* () {
    const engines = yield* Engines
    const startedAt = Date.now()

    const outcome = yield* engines
      .get(input.engine)
      .review({
        reviewer: {
          id: "verify",
          systemPrompt: VERIFY_PROMPT(input.findings),
          model: input.model,
          engine: input.engine
        },
        diff: input.diff,
        contextText: "",
        timeoutMs: input.timeoutMs
      })
      .pipe(Effect.result)

    const durationMs = Date.now() - startedAt

    if (Result.isFailure(outcome)) {
      // 裁判掛了 → 保守處理：全部保留，記 failed
      const error = outcome.failure
      return {
        kept: [...input.findings],
        droppedCount: 0,
        run: {
          id: "verify",
          engine: input.engine,
          model: formatModelRef(input.model),
          status: "failed",
          findingCount: input.findings.length,
          durationMs,
          error: `${error._tag}: ${"message" in error ? error.message : ""}（verify 失敗，findings 全數保留）`
        }
      }
    }

    const { output, usage } = outcome.success
    const confirmed = new Map<string, number>()
    for (const judged of output.findings) {
      confirmed.set(matchKey(judged), judged.confidence)
    }

    const kept: AggregatedFinding[] = []
    let droppedCount = 0
    for (const finding of input.findings) {
      const judgeConfidence = confirmed.get(matchKey(finding))
      if (judgeConfidence === undefined) {
        droppedCount += 1
        continue
      }
      kept.push({ ...finding, confidence: (finding.confidence + judgeConfidence) / 2 })
    }

    return {
      kept,
      droppedCount,
      run: {
        id: "verify",
        engine: input.engine,
        model: formatModelRef(input.model),
        status: "ok",
        findingCount: kept.length,
        durationMs,
        ...(usage ? { usage } : {})
      }
    }
  })

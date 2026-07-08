import * as Effect from "effect/Effect"

import type { EngineError } from "../domain/errors.ts"
import type { ReviewerOutput } from "../domain/finding.ts"
import type { FixOutput } from "../domain/fix.ts"
import type { EngineId } from "../reviewers/registry.ts"
import type { EnginesShape, FixRequest, FixResult, ReviewRequest, ReviewResult } from "./engine.ts"

export type FakeBehavior =
  | { readonly kind: "ok"; readonly output: ReviewerOutput }
  | { readonly kind: "fail"; readonly error: EngineError }
  | { readonly kind: "hang" }

export type FakeFixBehavior =
  | { readonly kind: "ok"; readonly output: FixOutput }
  | { readonly kind: "fail"; readonly error: EngineError }
  | { readonly kind: "hang" }

export interface FakeCall {
  readonly engine: EngineId
  readonly reviewerId: string
  readonly model: string
}

/** 預設罐頭輸出：每個 reviewer 回一條 error finding，指向 diff 裡第一個檔案。 */
export const defaultFakeOutput = (request: ReviewRequest): ReviewerOutput => {
  const fileMatch = /\+\+\+ b\/(.+)/.exec(request.diff)
  return {
    findings: [
      {
        file: fileMatch?.[1] ?? "unknown.ts",
        line: 1,
        severity: "error",
        category: "correctness",
        title: `fake ${request.reviewer.id} finding`,
        rationale: "deterministic fake finding for tests",
        confidence: 0.9
      }
    ]
  }
}

/**
 * 測試用引擎：可腳本化每個 reviewer 的行為，並記錄呼叫。
 * pi 與 claude 兩個 id 都回同一個 fake。
 */
export const makeFakeEngines = (
  script?: Partial<Record<string, FakeBehavior>>,
  fixScript?: FakeFixBehavior
): { readonly engines: EnginesShape; readonly calls: FakeCall[] } => {
  const calls: FakeCall[] = []

  const review = (engineId: EngineId) => (request: ReviewRequest): Effect.Effect<ReviewResult, EngineError> =>
    // Effect.suspend：記錄與行為都要在「執行時」發生，retry 重跑才會被計到
    Effect.suspend(() => {
      calls.push({
        engine: engineId,
        reviewerId: request.reviewer.id,
        model: `${request.reviewer.model.provider}/${request.reviewer.model.modelId}`
      })

      const behavior = script?.[request.reviewer.id] ?? { kind: "ok" as const, output: defaultFakeOutput(request) }

      switch (behavior.kind) {
        case "ok":
          return Effect.succeed({
            output: behavior.output,
            usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 }
          })
        case "fail":
          return Effect.fail(behavior.error)
        case "hang":
          return Effect.never
      }
    })

  const generateFixes = (engineId: EngineId) => (request: FixRequest): Effect.Effect<FixResult, EngineError> =>
    Effect.suspend(() => {
      calls.push({ engine: engineId, reviewerId: "fix", model: `${request.model.provider}/${request.model.modelId}` })
      const behavior = fixScript ?? { kind: "ok" as const, output: { fixes: [] } }
      switch (behavior.kind) {
        case "ok":
          return Effect.succeed({ output: behavior.output, usage: { costUsd: 0.001 } })
        case "fail":
          return Effect.fail(behavior.error)
        case "hang":
          return Effect.never
      }
    })

  return {
    engines: {
      get: (id) => ({ id, review: review(id), generateFixes: generateFixes(id) })
    },
    calls
  }
}

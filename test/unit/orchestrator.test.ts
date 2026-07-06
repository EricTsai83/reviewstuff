import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"

import { EngineAuthError, EngineFailed } from "../../src/domain/errors.ts"
import { Engines } from "../../src/engines/engine.ts"
import { makeFakeEngines } from "../../src/engines/fake.ts"
import { runReviewers } from "../../src/review/orchestrator.ts"
import type { ResolvedReviewer } from "../../src/reviewers/registry.ts"

const REVIEWERS: ResolvedReviewer[] = [
  {
    id: "correctness",
    systemPrompt: "x",
    model: { provider: "openai-codex", modelId: "gpt-5.5" },
    engine: "pi"
  },
  {
    id: "security",
    systemPrompt: "x",
    model: { provider: "anthropic", modelId: "claude-sonnet-5" },
    engine: "claude"
  }
]

const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,1 +1,2 @@
 const a = 1
+const b = undefined!.x
`

const runWith = (
  script?: Parameters<typeof makeFakeEngines>[0],
  options?: { timeoutMs?: number; reviewers?: ResolvedReviewer[] }
) => {
  const fake = makeFakeEngines(script)
  const effect = runReviewers({
    reviewers: options?.reviewers ?? REVIEWERS,
    diff: DIFF,
    contextText: "",
    timeoutMs: options?.timeoutMs ?? 5_000,
    concurrency: 2
  }).pipe(Effect.provideService(Engines, fake.engines))
  return { fake, promise: Effect.runPromise(effect) }
}

describe("runReviewers", () => {
  it("runs all reviewers and aggregates findings", async () => {
    const { fake, promise } = runWith()
    const outcome = await promise
    expect(outcome.reviewerRuns).toHaveLength(2)
    expect(outcome.reviewerRuns.every((run) => run.status === "ok")).toBe(true)
    expect(fake.calls.map((call) => call.engine).sort()).toEqual(["claude", "pi"])
    expect(outcome.allFailed).toBe(false)
    // 兩個 fake 回同一條 finding → dedup 成一條、reviewers 聯集
    expect(outcome.findings.length).toBeGreaterThanOrEqual(1)
  })

  it("partial failure: one engine down, run continues", async () => {
    const { promise } = runWith({
      security: {
        kind: "fail",
        error: new EngineAuthError({ engine: "claude", provider: "anthropic", message: "未登入" })
      }
    })
    const outcome = await promise
    const security = outcome.reviewerRuns.find((run) => run.id === "security")
    expect(security?.status).toBe("failed")
    expect(security?.error).toContain("EngineAuthError")
    expect(outcome.reviewerRuns.find((run) => run.id === "correctness")?.status).toBe("ok")
    expect(outcome.allFailed).toBe(false)
  })

  it("all failed is flagged", async () => {
    const error = new EngineFailed({ engine: "pi", reviewer: "x", message: "boom", retryable: false })
    const { promise } = runWith({
      correctness: { kind: "fail", error },
      security: { kind: "fail", error }
    })
    const outcome = await promise
    expect(outcome.allFailed).toBe(true)
  })

  it("timeout maps to status timeout", async () => {
    const { promise } = runWith({ correctness: { kind: "hang" } }, { timeoutMs: 200 })
    const outcome = await promise
    expect(outcome.reviewerRuns.find((run) => run.id === "correctness")?.status).toBe("timeout")
  }, 10_000)

  it("does not retry non-retryable failures (single call)", async () => {
    const error = new EngineFailed({ engine: "pi", reviewer: "x", message: "fatal", retryable: false })
    const { fake, promise } = runWith({
      correctness: { kind: "fail", error },
      security: { kind: "fail", error }
    })
    await promise
    expect(fake.calls.filter((call) => call.reviewerId === "correctness")).toHaveLength(1)
  })

  it("retries retryable failures up to 2 times (3 calls total)", async () => {
    const error = new EngineFailed({ engine: "pi", reviewer: "x", message: "flaky", retryable: true })
    const { fake, promise } = runWith(
      {
        correctness: { kind: "fail", error },
        security: { kind: "fail", error }
      },
      { reviewers: [REVIEWERS[0]!] }
    )
    const outcome = await promise
    expect(outcome.reviewerRuns[0]?.status).toBe("failed")
    expect(fake.calls.filter((call) => call.reviewerId === "correctness")).toHaveLength(3)
  }, 15_000)
})

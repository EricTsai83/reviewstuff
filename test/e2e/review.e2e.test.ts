import * as Effect from "effect/Effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { reviewCommand } from "../../src/commands/review.ts"
import { EngineFailed } from "../../src/domain/errors.ts"
import { Engines } from "../../src/engines/engine.ts"
import { makeFakeEngines } from "../../src/engines/fake.ts"
import type { FakeBehavior } from "../../src/engines/fake.ts"
import { GitServiceLive } from "../../src/git/service.ts"
import type { Report } from "../../src/domain/report.ts"
import { makeFixtureRepo } from "./fixture.ts"
import type { FixtureRepo } from "./fixture.ts"

let fixture: FixtureRepo
let originalCwd: string

beforeAll(() => {
  originalCwd = process.cwd()
  fixture = makeFixtureRepo()
  process.chdir(fixture.root)
})

afterAll(() => {
  process.chdir(originalCwd)
  fixture.cleanup()
})

/** 跑完整 review command（GitService 真的、引擎假的），攔截 stdout 抓 JSON 報告。 */
const runReview = async (
  script?: Partial<Record<string, FakeBehavior>>,
  flags: Parameters<typeof reviewCommand>[0] = {}
): Promise<{ exitCode: number; report: Report | null }> => {
  const fake = makeFakeEngines(script)
  const logs: string[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => logs.push(args.join(" "))

  try {
    const exitCode = await Effect.runPromise(
      reviewCommand({ staged: true, json: true, ...flags }).pipe(
        Effect.provideService(Engines, fake.engines),
        Effect.provide(GitServiceLive)
      )
    )
    const jsonText = logs.join("\n")
    return { exitCode, report: jsonText.trim() ? (JSON.parse(jsonText) as Report) : null }
  } finally {
    console.log = originalLog
  }
}

describe("review command e2e（fixture repo + fake engines）", () => {
  it("staged diff → findings → exit 1，envelope 形狀正確", async () => {
    const { exitCode, report } = await runReview()
    expect(exitCode).toBe(1)
    expect(report).not.toBeNull()
    expect(report!.version).toBe(1)
    expect(report!.scope.kind).toBe("staged")
    expect(report!.scope.files).toEqual(["src/user.ts"])
    // 三個 reviewer 都跑了（fixture 是 .ts diff）
    expect(report!.reviewers.map((run) => run.id).sort()).toEqual(["correctness", "security", "typescript"])
    expect(report!.reviewers.every((run) => run.status === "ok")).toBe(true)
    // fake 引擎對每個 reviewer 回同一條 finding → dedup 成一條？
    // 不同 reviewer 的 title 不同（含 reviewer id）→ 不會 dedup，各自保留
    expect(report!.findings.length).toBeGreaterThan(0)
    expect(report!.summary.total).toBe(report!.findings.length)
    expect(report!.exitCode).toBe(1)
  })

  it("--fail-on none → exit 0（findings 照樣輸出）", async () => {
    const { exitCode, report } = await runReview(undefined, { failOn: "none" })
    expect(exitCode).toBe(0)
    expect(report!.findings.length).toBeGreaterThan(0)
  })

  it("--fail-on critical → exit 0（fake findings 是 error 級）", async () => {
    const { exitCode } = await runReview(undefined, { failOn: "critical" })
    expect(exitCode).toBe(0)
  })

  it("單一引擎失敗 → 該 reviewer 標 failed，整體照跑、exit 由其餘 findings 決定", async () => {
    const { exitCode, report } = await runReview({
      security: {
        kind: "fail",
        error: new EngineFailed({ engine: "claude", reviewer: "security", message: "boom", retryable: false })
      }
    })
    expect(exitCode).toBe(1)
    const security = report!.reviewers.find((run) => run.id === "security")
    expect(security?.status).toBe("failed")
    expect(security?.error).toContain("EngineFailed")
    expect(report!.reviewers.filter((run) => run.status === "ok")).toHaveLength(2)
  })

  it("全部引擎失敗 → exit 3", async () => {
    const error = (id: string) =>
      new EngineFailed({ engine: "pi", reviewer: id, message: "down", retryable: false })
    const { exitCode, report } = await runReview({
      correctness: { kind: "fail", error: error("correctness") },
      security: { kind: "fail", error: error("security") },
      typescript: { kind: "fail", error: error("typescript") }
    })
    expect(exitCode).toBe(3)
    expect(report!.exitCode).toBe(3)
  })

  it("--reviewers 子集只跑指定的", async () => {
    const { report } = await runReview(undefined, { reviewers: "correctness" })
    expect(report!.reviewers.map((run) => run.id)).toEqual(["correctness"])
  })
})

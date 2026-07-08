import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import * as Effect from "effect/Effect"
import { afterAll, describe, expect, it } from "vitest"

import { resolveRun } from "../../src/config/service.ts"
import { Engines } from "../../src/engines/engine.ts"
import { makeFakeEngines } from "../../src/engines/fake.ts"
import type { AggregatedFinding } from "../../src/domain/report.ts"
import { loadBaseline, partitionByBaseline, saveBaseline } from "../../src/review/baseline.ts"
import { boostCrossModelAgreement } from "../../src/review/dedup.ts"
import { verifyFindings } from "../../src/review/verify.ts"
import { detectFrameworks } from "../../src/reviewers/registry.ts"

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

const finding = (overrides: Partial<AggregatedFinding> = {}): AggregatedFinding => ({
  id: "f-01",
  fingerprint: "fp-1",
  reviewers: ["correctness"],
  file: "src/a.ts",
  line: 3,
  severity: "error",
  category: "correctness",
  title: "bug",
  rationale: "because",
  confidence: 0.8,
  ...overrides
})

describe("resolveRun profiles", () => {
  const tsFiles = ["src/a.ts"]

  it("standard 不啟用 architecture/performance/framework", async () => {
    const resolved = await run(resolveRun({}, {}, tsFiles, { frameworks: ["React"] }))
    expect(resolved.profile).toBe("standard")
    expect(resolved.reviewers.map((r) => r.id)).toEqual(["correctness", "security", "typescript"])
    expect(resolved.verify).toBeUndefined()
  })

  it("quick 只有一個合併 reviewer", async () => {
    const resolved = await run(resolveRun({}, { profile: "quick" }, tsFiles))
    expect(resolved.reviewers.map((r) => r.id)).toEqual(["quick"])
    expect(resolved.verify).toBeUndefined()
  })

  it("thorough 展開雙模型對照、預設開 verify、含 framework（有偵測到框架）", async () => {
    const resolved = await run(resolveRun({}, { profile: "thorough" }, tsFiles, { frameworks: ["React"] }))
    const ids = resolved.reviewers.map((r) => r.id)
    expect(ids).toContain("correctness@openai-codex")
    expect(ids).toContain("correctness@anthropic")
    expect(ids).toContain("framework@openai-codex")
    expect(resolved.verify).toBeDefined()
    expect(resolved.verify?.model.modelId).toBe("gpt-5.4-mini")
    // 對照實例走 provider 路由
    const altSecurity = resolved.reviewers.find((r) => r.id === "security@openai-codex")
    expect(altSecurity?.engine).toBe("pi")
  })

  it("framework reviewer 在偵測不到框架時被跳過", async () => {
    const resolved = await run(resolveRun({}, { profile: "thorough" }, tsFiles, { frameworks: [] }))
    expect(resolved.reviewers.some((r) => r.id.startsWith("framework"))).toBe(false)
  })

  it("--no-verify 壓過 thorough 預設", async () => {
    const resolved = await run(resolveRun({}, { profile: "thorough", verify: false }, tsFiles))
    expect(resolved.verify).toBeUndefined()
  })

  it("config verify.enabled 在 standard 也能開", async () => {
    const resolved = await run(resolveRun({ verify: { enabled: true, model: "anthropic/claude-haiku-4-5" } }, {}, tsFiles))
    expect(resolved.verify?.engine).toBe("claude")
  })
})

describe("detectFrameworks", () => {
  it("從 dependencies 偵測", () => {
    expect(detectFrameworks({ dependencies: { next: "1", react: "1" }, devDependencies: { effect: "4" } })).toEqual([
      "Next.js",
      "React",
      "Effect"
    ])
  })

  it("空/壞輸入回空陣列", () => {
    expect(detectFrameworks(null)).toEqual([])
    expect(detectFrameworks({})).toEqual([])
  })
})

describe("baseline", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "reviewstuff-baseline-"))
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it("save → load → partition 濾掉已知 fingerprints", () => {
    const known = finding({ fingerprint: "known" })
    const fresh = finding({ fingerprint: "fresh", id: "f-02" })
    saveBaseline(tmp, [known])
    const baseline = loadBaseline(tmp)
    expect(baseline.has("known")).toBe(true)
    const partitioned = partitionByBaseline([known, fresh], baseline)
    expect(partitioned.fresh.map((f) => f.fingerprint)).toEqual(["fresh"])
    expect(partitioned.suppressed.map((f) => f.fingerprint)).toEqual(["known"])
  })

  it("無 baseline 檔 → 空集合", () => {
    expect(loadBaseline("/nonexistent-dir").size).toBe(0)
  })
})

describe("boostCrossModelAgreement", () => {
  it("兩家 provider 同意 → confidence 加成（封頂 1）", () => {
    const boosted = boostCrossModelAgreement([
      finding({ reviewers: ["correctness@openai-codex", "correctness@anthropic"], confidence: 0.9 }),
      finding({ reviewers: ["security@anthropic"], confidence: 0.8, id: "f-02" })
    ])
    expect(boosted[0]?.confidence).toBe(1)
    expect(boosted[1]?.confidence).toBe(0.8)
  })

  it("沒有 @ 後綴（非 thorough）不動", () => {
    const boosted = boostCrossModelAgreement([finding({ reviewers: ["correctness", "security"] })])
    expect(boosted[0]?.confidence).toBe(0.8)
  })
})

describe("verifyFindings", () => {
  const DIFF = `--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n+const x = 1\n`

  it("裁判重發的 findings 保留（信心平均），沒重發的剔除", async () => {
    const confirmedCandidate = finding({ file: "src/a.ts", line: 3, category: "correctness", confidence: 0.8 })
    const droppedCandidate = finding({ file: "src/b.ts", line: 9, category: "security", id: "f-02", fingerprint: "fp-2" })

    const fake = makeFakeEngines({
      // 裁判（reviewer id = "verify"）只重發第一條（同 file/line/category），信心 0.6
      verify: {
        kind: "ok",
        output: {
          findings: [
            { file: "src/a.ts", line: 4, severity: "error", category: "correctness", title: "rewritten", rationale: "yes", confidence: 0.6 }
          ]
        }
      }
    })

    const outcome = await run(
      verifyFindings({
        findings: [confirmedCandidate, droppedCandidate],
        diff: DIFF,
        model: { provider: "openai-codex", modelId: "gpt-5.4-mini" },
        engine: "pi",
        timeoutMs: 5_000
      }).pipe(Effect.provideService(Engines, fake.engines))
    )

    expect(outcome.kept).toHaveLength(1)
    expect(outcome.kept[0]?.confidence).toBeCloseTo(0.7)
    expect(outcome.droppedCount).toBe(1)
    expect(outcome.run.status).toBe("ok")
  })

  it("裁判掛掉 → 全數保留、run 標 failed", async () => {
    const fake = makeFakeEngines({
      verify: { kind: "hang" }
    })
    const outcome = await run(
      verifyFindings({
        findings: [finding()],
        diff: DIFF,
        model: { provider: "openai-codex", modelId: "gpt-5.4-mini" },
        engine: "pi",
        timeoutMs: 5_000
      }).pipe(
        Effect.provideService(Engines, {
          get: () => ({
            id: "pi",
            review: () =>
              Effect.fail(
                // 直接失敗，模擬裁判引擎壞掉
                new (class extends Error {
                  readonly _tag = "EngineFailed"
                  readonly message = "judge down"
                })() as never
              ),
            generateFixes: () => Effect.fail(undefined as never)
          })
        })
      )
    )
    expect(outcome.kept).toHaveLength(1)
    expect(outcome.droppedCount).toBe(0)
    expect(outcome.run.status).toBe("failed")
    void fake
  })
})

import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import * as Effect from "effect/Effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AggregatedFinding } from "../../src/domain/report.ts"
import { Engines } from "../../src/engines/engine.ts"
import { makeFakeEngines } from "../../src/engines/fake.ts"
import { GitServiceLive } from "../../src/git/service.ts"
import { generateAndValidateFixes } from "../../src/review/fix.ts"

let repo: string

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } })

beforeEach(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), "reviewstuff-fix-test-"))
  git("init", "-b", "main")
  git("config", "user.email", "t@t")
  git("config", "user.name", "t")
  writeFileSync(path.join(repo, "a.txt"), "buggy\n")
  git("add", ".")
  git("commit", "-m", "base")
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

const finding: AggregatedFinding = {
  id: "f-01",
  fingerprint: "fp",
  reviewers: ["correctness"],
  file: "a.txt",
  line: 1,
  severity: "error",
  category: "correctness",
  title: "fix it",
  rationale: "buggy",
  confidence: 0.9
}

const run = (
  effect: ReturnType<typeof generateAndValidateFixes>,
  engines: ReturnType<typeof makeFakeEngines>
) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Engines, engines.engines), Effect.provide(GitServiceLive))
  )

describe("generateAndValidateFixes", () => {
  it("無 gates → allGreen=true，回傳 fixes（未驗證）", async () => {
    const engines = makeFakeEngines(undefined, {
      kind: "ok",
      output: { fixes: [{ file: "a.txt", content: "fixed\n", explanation: "改好了" }] }
    })
    const result = await run(
      generateAndValidateFixes({
        repoRoot: repo,
        findings: [finding],
        model: { provider: "openai-codex", modelId: "gpt-5.5" },
        engine: "pi",
        gates: {},
        timeoutMs: 5_000
      }),
      engines
    )
    expect(result.allGreen).toBe(true)
    expect(result.fixes).toHaveLength(1)
    // 沒動到真檔案（只在 worktree／記憶體）
    expect(readFileSync(path.join(repo, "a.txt"), "utf8")).toBe("buggy\n")
  })

  it("gate 通過 → allGreen=true", async () => {
    const engines = makeFakeEngines(undefined, {
      kind: "ok",
      output: { fixes: [{ file: "a.txt", content: "fixed\n", explanation: "x" }] }
    })
    const result = await run(
      generateAndValidateFixes({
        repoRoot: repo,
        findings: [finding],
        model: { provider: "openai-codex", modelId: "gpt-5.5" },
        engine: "pi",
        gates: { test: "grep -q fixed a.txt" },
        timeoutMs: 10_000
      }),
      engines
    )
    expect(result.gates).toHaveLength(1)
    expect(result.gates[0]?.passed).toBe(true)
    expect(result.allGreen).toBe(true)
  })

  it("gate 失敗 → allGreen=false", async () => {
    const engines = makeFakeEngines(undefined, {
      kind: "ok",
      output: { fixes: [{ file: "a.txt", content: "still-wrong\n", explanation: "x" }] }
    })
    const result = await run(
      generateAndValidateFixes({
        repoRoot: repo,
        findings: [finding],
        model: { provider: "openai-codex", modelId: "gpt-5.5" },
        engine: "pi",
        gates: { test: "grep -q fixed a.txt" },
        timeoutMs: 10_000
      }),
      engines
    )
    expect(result.gates[0]?.passed).toBe(false)
    expect(result.allGreen).toBe(false)
  })

  it("模型沒產生修復 → 空 fixes、allGreen=false", async () => {
    const engines = makeFakeEngines(undefined, { kind: "ok", output: { fixes: [] } })
    const result = await run(
      generateAndValidateFixes({
        repoRoot: repo,
        findings: [finding],
        model: { provider: "openai-codex", modelId: "gpt-5.5" },
        engine: "pi",
        gates: { test: "true" },
        timeoutMs: 5_000
      }),
      engines
    )
    expect(result.fixes).toHaveLength(0)
    expect(result.allGreen).toBe(false)
  })

  it("worktree 用完清掉（git worktree list 只剩主）", async () => {
    const engines = makeFakeEngines(undefined, {
      kind: "ok",
      output: { fixes: [{ file: "a.txt", content: "fixed\n", explanation: "x" }] }
    })
    await run(
      generateAndValidateFixes({
        repoRoot: repo,
        findings: [finding],
        model: { provider: "openai-codex", modelId: "gpt-5.5" },
        engine: "pi",
        gates: { test: "true" },
        timeoutMs: 5_000
      }),
      engines
    )
    const worktrees = git("worktree", "list").trim().split("\n")
    expect(worktrees).toHaveLength(1)
  })
})

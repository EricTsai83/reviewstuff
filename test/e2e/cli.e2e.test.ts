import { execFileSync } from "node:child_process"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { Report } from "../../src/domain/report.ts"
import { makeFixtureRepo } from "./fixture.ts"
import type { FixtureRepo } from "./fixture.ts"

const CLI = path.resolve(__dirname, "../../dist/cli.mjs")

let fixture: FixtureRepo

beforeAll(() => {
  fixture = makeFixtureRepo()
})

afterAll(() => {
  fixture.cleanup()
})

interface CliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

const runCli = (...args: string[]): CliResult => {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      cwd: fixture.root,
      encoding: "utf8",
      env: { ...process.env, AI_REVIEW_FAKE_ENGINE: "1" }
    })
    return { exitCode: 0, stdout, stderr: "" }
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string }
    return {
      exitCode: failed.status ?? -1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? ""
    }
  }
}

describe("binary e2e（dist/cli.mjs + AI_REVIEW_FAKE_ENGINE=1）", () => {
  it("--staged --json：stdout 是合約 JSON、shell exit code = 1", () => {
    const result = runCli("--staged", "--json")
    expect(result.exitCode).toBe(1)
    const report = JSON.parse(result.stdout) as Report
    expect(report.version).toBe(1)
    expect(report.exitCode).toBe(1)
    expect(report.scope.files).toEqual(["src/user.ts"])
    expect(report.findings.length).toBeGreaterThan(0)
  })

  it("--fail-on none → exit 0", () => {
    const result = runCli("--staged", "--json", "--fail-on", "none")
    expect(result.exitCode).toBe(0)
  })

  it("人話模式輸出到 stdout", () => {
    const result = runCli("--staged")
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("finding")
  })

  it("非 git repo → exit 2", () => {
    try {
      execFileSync("node", [CLI, "--staged"], {
        cwd: "/tmp",
        encoding: "utf8",
        env: { ...process.env, AI_REVIEW_FAKE_ENGINE: "1" }
      })
      expect.unreachable()
    } catch (error) {
      expect((error as { status?: number }).status).toBe(2)
    }
  })

  it("未知 reviewer → exit 2", () => {
    const result = runCli("--staged", "--reviewers", "nope")
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("未知的 reviewer")
  })
})

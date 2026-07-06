import { execFileSync } from "node:child_process"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { Report } from "../../src/domain/report.ts"
import { makeFixtureRepo } from "./fixture.ts"
import type { FixtureRepo } from "./fixture.ts"

/**
 * Live smoke：燒真訂閱額度，只在 RUN_LIVE=1 時跑。
 *   RUN_LIVE=1 pnpm vitest run test/e2e/live.smoke.test.ts
 */
const LIVE = process.env["RUN_LIVE"] === "1"
const CLI = path.resolve(__dirname, "../../dist/cli.mjs")

let fixture: FixtureRepo

beforeAll(() => {
  if (LIVE) fixture = makeFixtureRepo()
})

afterAll(() => {
  fixture?.cleanup()
})

describe.skipIf(!LIVE)("live smoke（真引擎、真訂閱）", () => {
  it("兩個引擎都對種入的 bug 產出 findings", () => {
    let stdout = ""
    let exitCode = 0
    try {
      stdout = execFileSync("node", [CLI, "--staged", "--json"], {
        cwd: fixture.root,
        encoding: "utf8",
        timeout: 300_000
      })
    } catch (error) {
      const failed = error as { status?: number; stdout?: string }
      exitCode = failed.status ?? -1
      stdout = failed.stdout ?? ""
    }

    const report = JSON.parse(stdout) as Report
    expect(exitCode).toBe(1)
    // 至少一條 finding 指到種入 bug 的檔案
    expect(report.findings.some((finding) => finding.file.includes("user.ts"))).toBe(true)
    // 兩個引擎都成功跑完
    const engines = new Set(report.reviewers.filter((run) => run.status === "ok").map((run) => run.engine))
    expect(engines.has("pi")).toBe(true)
    expect(engines.has("claude")).toBe(true)
  }, 360_000)
})

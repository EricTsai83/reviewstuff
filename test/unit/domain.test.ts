import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { Finding, ReviewerOutput } from "../../src/domain/finding.ts"
import { exitCodeFor, fingerprintOf, summarize } from "../../src/domain/report.ts"
import { dedupeFindings } from "../../src/review/dedup.ts"

const validFinding = {
  file: "src/user.ts",
  line: 6,
  severity: "error",
  category: "correctness",
  title: "Missing null check",
  rationale: "email is optional but dereferenced unconditionally",
  confidence: 0.95
}

describe("Finding schema", () => {
  it("decodes a valid finding", () => {
    const decoded = Schema.decodeUnknownSync(Finding)(validFinding)
    expect(decoded.file).toBe("src/user.ts")
    expect(decoded.line).toBe(6)
  })

  it("decodes without optional fields", () => {
    const { line, ...rest } = validFinding
    const decoded = Schema.decodeUnknownSync(Finding)(rest)
    expect(decoded.line).toBeUndefined()
  })

  it("rejects an invalid severity", () => {
    expect(() => Schema.decodeUnknownSync(Finding)({ ...validFinding, severity: "fatal" })).toThrow()
  })

  it("rejects missing required fields", () => {
    expect(() => Schema.decodeUnknownSync(ReviewerOutput)({ findings: [{ file: "a.ts" }] })).toThrow()
  })

  it("decodes a full reviewer output", () => {
    const decoded = Schema.decodeUnknownSync(ReviewerOutput)({ findings: [validFinding] })
    expect(decoded.findings).toHaveLength(1)
  })
})

describe("exitCodeFor", () => {
  const finding = Schema.decodeUnknownSync(Finding)(validFinding)

  it("returns 1 when a finding meets the threshold", () => {
    expect(exitCodeFor([finding], "error")).toBe(1)
    expect(exitCodeFor([finding], "warning")).toBe(1)
  })

  it("returns 0 when below the threshold", () => {
    expect(exitCodeFor([finding], "critical")).toBe(0)
  })

  it("returns 0 with failOn none", () => {
    expect(exitCodeFor([finding], "none")).toBe(0)
  })

  it("returns 0 with no findings", () => {
    expect(exitCodeFor([], "info")).toBe(0)
  })
})

describe("fingerprint + dedup", () => {
  const finding = Schema.decodeUnknownSync(Finding)(validFinding)

  it("same bucket → same fingerprint despite line jitter and title case", () => {
    const a = { ...finding, line: 6, title: "Missing null check" }
    const b = { ...finding, line: 8, title: "missing NULL check!" }
    expect(fingerprintOf(a)).toBe(fingerprintOf(b))
  })

  it("different file → different fingerprint", () => {
    expect(fingerprintOf(finding)).not.toBe(fingerprintOf({ ...finding, file: "src/other.ts" }))
  })

  it("merges duplicates across reviewers, keeping max severity and union of reviewers", () => {
    const merged = dedupeFindings([
      { reviewerId: "correctness", findings: [{ ...finding, severity: "warning", confidence: 0.6 }] },
      { reviewerId: "security", findings: [{ ...finding, severity: "error", confidence: 0.9 }] }
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.severity).toBe("error")
    expect(merged[0]?.confidence).toBe(0.9)
    expect(merged[0]?.reviewers).toEqual(["correctness", "security"])
  })

  it("sorts by severity descending", () => {
    const merged = dedupeFindings([
      {
        reviewerId: "a",
        findings: [
          { ...finding, file: "z.ts", severity: "info" },
          { ...finding, file: "a.ts", severity: "critical" }
        ]
      }
    ])
    expect(merged[0]?.severity).toBe("critical")
  })
})

describe("summarize", () => {
  const finding = Schema.decodeUnknownSync(Finding)(validFinding)

  it("counts by severity", () => {
    const summary = summarize([finding, { ...finding, severity: "critical" }])
    expect(summary.total).toBe(2)
    expect(summary.bySeverity.error).toBe(1)
    expect(summary.bySeverity.critical).toBe(1)
  })
})

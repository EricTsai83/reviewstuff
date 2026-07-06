import { createHash } from "node:crypto"

import type { Finding, Severity } from "./finding.ts"
import { maxSeverity, severityAtLeast } from "./finding.ts"

/** 彙整後的 finding：附 fingerprint 與來源 reviewer。 */
export interface AggregatedFinding extends Finding {
  readonly id: string
  readonly fingerprint: string
  readonly reviewers: readonly string[]
}

export interface ReviewerRun {
  readonly id: string
  readonly engine: string
  readonly model: string
  readonly status: "ok" | "failed" | "timeout"
  readonly findingCount: number
  readonly durationMs: number
  readonly error?: string
  readonly usage?: {
    readonly inputTokens?: number
    readonly outputTokens?: number
    readonly costUsd?: number
  }
}

export interface Report {
  readonly version: 1
  readonly scope: { readonly kind: string; readonly files: readonly string[] }
  readonly ranAt: string
  readonly durationMs: number
  readonly reviewers: readonly ReviewerRun[]
  readonly findings: readonly AggregatedFinding[]
  readonly summary: {
    readonly total: number
    readonly bySeverity: Record<Severity, number>
    readonly suppressed?: number
    readonly droppedByVerify?: number
    readonly totalCostUsd?: number
  }
  readonly exitCode: number
}

const normalizeTitle = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, " ").trim()

export const fingerprintOf = (finding: Finding): string =>
  createHash("sha1")
    .update(
      [finding.file, Math.floor((finding.line ?? 0) / 5), finding.category, normalizeTitle(finding.title)].join("|")
    )
    .digest("hex")

export type FailOn = Severity | "none"

/** 純函式：由 findings 與門檻計算 exit code（0 或 1）。 */
export const exitCodeFor = (findings: readonly Finding[], failOn: FailOn): number => {
  if (failOn === "none") return 0
  return findings.some((finding) => severityAtLeast(finding.severity, failOn)) ? 1 : 0
}

export const summarize = (findings: readonly Finding[]): Report["summary"] => {
  const bySeverity: Record<Severity, number> = { info: 0, warning: 0, error: 0, critical: 0 }
  for (const finding of findings) bySeverity[finding.severity] += 1
  return { total: findings.length, bySeverity }
}

export { maxSeverity }

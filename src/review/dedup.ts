import type { Finding } from "../domain/finding.ts"
import { maxSeverity } from "../domain/finding.ts"
import type { AggregatedFinding } from "../domain/report.ts"
import { fingerprintOf } from "../domain/report.ts"

/**
 * 純函式：跨 reviewer 合併 findings。
 * 同 fingerprint 的 finding 合併為一條：嚴重度取最高、confidence 取最高、reviewer 出處聯集。
 */
export const dedupeFindings = (
  perReviewer: ReadonlyArray<{ readonly reviewerId: string; readonly findings: readonly Finding[] }>
): AggregatedFinding[] => {
  const byFingerprint = new Map<string, AggregatedFinding>()
  let counter = 0

  for (const { reviewerId, findings } of perReviewer) {
    for (const finding of findings) {
      const fingerprint = fingerprintOf(finding)
      const existing = byFingerprint.get(fingerprint)

      if (!existing) {
        counter += 1
        byFingerprint.set(fingerprint, {
          ...finding,
          id: `f-${String(counter).padStart(2, "0")}`,
          fingerprint,
          reviewers: [reviewerId]
        })
        continue
      }

      byFingerprint.set(fingerprint, {
        ...existing,
        severity: maxSeverity(existing.severity, finding.severity),
        confidence: Math.max(existing.confidence, finding.confidence),
        reviewers: existing.reviewers.includes(reviewerId)
          ? existing.reviewers
          : [...existing.reviewers, reviewerId]
      })
    }
  }

  const severityRank = { critical: 3, error: 2, warning: 1, info: 0 } as const
  return [...byFingerprint.values()].sort(
    (a, b) => severityRank[b.severity] - severityRank[a.severity] || a.file.localeCompare(b.file)
  )
}

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import type { AggregatedFinding } from "../domain/report.ts"

/** 存量 findings 抑制：baseline 檔記 fingerprints，review 時濾掉已知項。 */

export const BASELINE_RELATIVE_PATH = path.join(".reviewstuff", "baseline.json")

interface BaselineFile {
  readonly version: 1
  readonly updatedAt: string
  readonly fingerprints: readonly string[]
}

export const loadBaseline = (repoRoot: string): ReadonlySet<string> => {
  try {
    const parsed = JSON.parse(
      readFileSync(path.join(repoRoot, BASELINE_RELATIVE_PATH), "utf8")
    ) as Partial<BaselineFile>
    return new Set(Array.isArray(parsed.fingerprints) ? parsed.fingerprints : [])
  } catch {
    return new Set()
  }
}

/** 覆寫式快照：以「目前這輪全部 findings」為新的 baseline。 */
export const saveBaseline = (repoRoot: string, findings: readonly AggregatedFinding[]): string => {
  const filePath = path.join(repoRoot, BASELINE_RELATIVE_PATH)
  mkdirSync(path.dirname(filePath), { recursive: true })
  const file: BaselineFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    fingerprints: [...new Set(findings.map((finding) => finding.fingerprint))].sort()
  }
  writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`)
  return filePath
}

/** 純函式：把 findings 分成新增（fresh）與 baseline 已知（suppressed）。 */
export const partitionByBaseline = (
  findings: readonly AggregatedFinding[],
  baseline: ReadonlySet<string>
): { readonly fresh: AggregatedFinding[]; readonly suppressed: AggregatedFinding[] } => {
  const fresh: AggregatedFinding[] = []
  const suppressed: AggregatedFinding[] = []
  for (const finding of findings) {
    ;(baseline.has(finding.fingerprint) ? suppressed : fresh).push(finding)
  }
  return { fresh, suppressed }
}

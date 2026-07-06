import pc from "picocolors"

import type { Severity } from "../domain/finding.ts"
import type { AggregatedFinding, Report } from "../domain/report.ts"

const severityLabel = (severity: Severity): string => {
  switch (severity) {
    case "critical":
      return pc.bgRed(pc.white(" CRIT "))
    case "error":
      return pc.red("ERROR ")
    case "warning":
      return pc.yellow("WARN  ")
    case "info":
      return pc.blue("INFO  ")
  }
}

const renderFinding = (finding: AggregatedFinding): string => {
  const location = finding.line !== undefined ? `:${finding.line}` : ""
  const lines = [
    `  ${severityLabel(finding.severity)} ${pc.bold(finding.title)}  ${pc.dim(`[${finding.category}] ${finding.reviewers.join("+")} · ${(finding.confidence * 100).toFixed(0)}%`)}`,
    `         ${pc.dim(`${finding.file}${location}`)}`,
    ...finding.rationale.split("\n").map((line) => `         ${line}`)
  ]
  if (finding.suggestion) {
    lines.push(`         ${pc.green("→")} ${finding.suggestion}`)
  }
  return lines.join("\n")
}

export const renderTerminal = (report: Report): string => {
  const out: string[] = []

  out.push(pc.bold(`\nai-review · ${report.scope.kind} · ${report.scope.files.length} file(s)`))
  out.push("")

  for (const run of report.reviewers) {
    const statusIcon =
      run.status === "ok" ? pc.green("✓") : run.status === "timeout" ? pc.yellow("⏱") : pc.red("✗")
    const cost = run.usage?.costUsd !== undefined ? ` · $${run.usage.costUsd.toFixed(4)}` : ""
    const errorText = run.error ? ` ${pc.red(run.error)}` : ""
    out.push(
      `  ${statusIcon} ${run.id.padEnd(12)} ${pc.dim(`${run.engine} · ${run.model} · ${(run.durationMs / 1000).toFixed(1)}s${cost}`)}${errorText}`
    )
  }
  out.push("")

  if (report.findings.length === 0) {
    out.push(pc.green("  沒有發現問題。"))
  } else {
    const byFile = new Map<string, AggregatedFinding[]>()
    for (const finding of report.findings) {
      const list = byFile.get(finding.file) ?? []
      list.push(finding)
      byFile.set(finding.file, list)
    }
    for (const [file, findings] of byFile) {
      out.push(pc.underline(file))
      for (const finding of findings) out.push(renderFinding(finding))
      out.push("")
    }
  }

  const { bySeverity, total } = report.summary
  const counts = [
    bySeverity.critical ? pc.red(`critical ${bySeverity.critical}`) : "",
    bySeverity.error ? pc.red(`error ${bySeverity.error}`) : "",
    bySeverity.warning ? pc.yellow(`warning ${bySeverity.warning}`) : "",
    bySeverity.info ? pc.blue(`info ${bySeverity.info}`) : ""
  ].filter(Boolean)

  const extras = [
    report.summary.suppressed ? pc.dim(`baseline 抑制 ${report.summary.suppressed}`) : "",
    report.summary.droppedByVerify ? pc.dim(`verify 剔除 ${report.summary.droppedByVerify}`) : "",
    report.summary.totalCostUsd ? pc.dim(`$${report.summary.totalCostUsd.toFixed(4)}`) : ""
  ].filter(Boolean)

  out.push(
    pc.bold(`  ${total} finding(s)`) +
      (counts.length ? `  ${counts.join(" · ")}` : "") +
      (extras.length ? `  ${extras.join(" · ")}` : "") +
      pc.dim(`  (${(report.durationMs / 1000).toFixed(1)}s)`)
  )
  out.push("")
  return out.join("\n")
}

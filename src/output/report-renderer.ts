import type { ReviewReport } from "../domain/report";

const terminalControlCharacter = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu;

const escapeTerminalText = (value: string): string =>
  value.replace(terminalControlCharacter, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );

export const renderJsonReport = (report: ReviewReport): string =>
  JSON.stringify(report, undefined, 2);

export const renderTerminalReport = (report: ReviewReport): string => {
  if (report.summary.changedFiles === 0) {
    return "No changes to review.";
  }

  if (report.findings.length === 0) {
    return `Reviewed ${report.summary.changedFiles} changed file(s). No findings.`;
  }

  const findings = report.findings.map(
    (finding) =>
      `${escapeTerminalText(finding.file)}:${finding.line} [${escapeTerminalText(finding.severity)}] ${escapeTerminalText(finding.message)} (${escapeTerminalText(finding.ruleId)})`,
  );

  return [
    ...findings,
    "",
    `Found ${report.summary.findings} finding(s) in ${report.summary.changedFiles} changed file(s).`,
  ].join("\n");
};

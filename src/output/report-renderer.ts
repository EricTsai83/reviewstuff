import type { ReviewFileCoverage } from "../domain/review-file";
import type { ReviewReport } from "../domain/report";

const terminalControlCharacter = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu;

export const escapeTerminalText = (value: string): string =>
  value.replace(terminalControlCharacter, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );

const renderSkippedFile = (
  file: Extract<ReviewFileCoverage, { readonly status: "skipped" }>,
): string => {
  const path = escapeTerminalText(file.path);
  const source = escapeTerminalText(file.source);

  return file.reason === "binary"
    ? `- ${path} [${source}] — binary file`
    : `- ${path} [${source}] — ${file.sizeBytes} bytes exceeds the ${file.limitBytes} byte file limit`;
};

export const renderJsonReport = (report: ReviewReport): string =>
  JSON.stringify(report, undefined, 2);

export const renderTerminalReport = (report: ReviewReport): string => {
  if (report.summary.changedFiles === 0) {
    return "No changes to review.";
  }

  const findings = report.findings.map(
    (finding) =>
      `${escapeTerminalText(finding.file)}:${finding.line} [${escapeTerminalText(finding.severity)}] ${escapeTerminalText(finding.message)} (${escapeTerminalText(finding.ruleId)})`,
  );

  const result = report.findings.length === 0
    ? `Reviewed ${report.summary.reviewedFiles} changed file(s). No findings.`
    : [
        ...findings,
        "",
        `Found ${report.summary.findings} finding(s) in ${report.summary.reviewedFiles} reviewed file(s).`,
      ].join("\n");

  if (report.coverage.complete) {
    return result;
  }

  const skippedFiles = report.coverage.files.filter(
    (
      file,
    ): file is Extract<ReviewFileCoverage, { readonly status: "skipped" }> =>
      file.status === "skipped",
  );

  return [
    result,
    "",
    `Review coverage incomplete: reviewed ${report.summary.reviewedFiles} of ${report.summary.changedFiles} changed file(s).`,
    "Skipped file(s):",
    ...skippedFiles.map(renderSkippedFile),
  ].join("\n");
};

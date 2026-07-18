import type { ReviewFileCoverage } from "../domain/review-file";
import { decodeReviewReportV4, type ReviewReportV4 } from "../domain/report";

const terminalControlCharacter = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu;

export const escapeTerminalText = (value: string): string =>
  value.replace(
    terminalControlCharacter,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

const renderSkippedFile = (
  file: Extract<ReviewFileCoverage, { readonly status: "skipped" }>,
): string => {
  const path = escapeTerminalText(file.path);
  const source = escapeTerminalText(file.source);

  if (file.reason === "binary") {
    return `- ${path} [${source}] — binary file`;
  }

  if (file.reason === "request-budget") {
    return `- ${path} [${source}] — 0 of ${file.totalHunks} hunks selected (request budget)`;
  }

  return `- ${path} [${source}] — ${file.sizeBytes} bytes exceeds the ${file.limitBytes} byte file limit`;
};

const renderTruncatedFile = (
  file: Extract<ReviewFileCoverage, { readonly status: "truncated" }>,
): string =>
  `- ${escapeTerminalText(file.path)} [${escapeTerminalText(file.source)}] — ${file.selectedHunks} of ${file.totalHunks} hunks selected (request budget)`;

const renderBudget = (report: ReviewReportV4): string =>
  `Request budget: ${report.budget.totalReservedTokens} of ${report.budget.maxTokens} tokens reserved (${report.budget.selectedRequestTokens} selected request, ${report.budget.fixedRequestOverheadTokens} fixed overhead, ${report.budget.outputReserveTokens} output reserve).`;

export const renderJsonReport = (report: ReviewReportV4): string =>
  JSON.stringify(decodeReviewReportV4(report), undefined, 2);

export const renderTerminalReport = (input: ReviewReportV4): string => {
  const report = decodeReviewReportV4(input);

  if (report.summary.changedFiles === 0) {
    return "No changes to review.";
  }

  const findings = report.findings.map(
    (finding) =>
      `${escapeTerminalText(finding.file)}:${finding.line} [${escapeTerminalText(finding.severity)}/${escapeTerminalText(finding.category)} confidence=${finding.confidence}] ${escapeTerminalText(finding.message)} (${escapeTerminalText(finding.ruleId)})`,
  );

  const reviewSummaryText =
    report.findings.length === 0
      ? `Reviewed ${report.summary.reviewedFiles} changed file(s). No findings.`
      : [
          ...findings,
          "",
          `Found ${report.summary.findings} finding(s) in ${report.summary.reviewedFiles} reviewed file(s).`,
        ].join("\n");

  if (report.coverage.complete) {
    return [reviewSummaryText, "", renderBudget(report)].join("\n");
  }

  const truncatedFiles = report.coverage.files.filter(
    (
      file,
    ): file is Extract<ReviewFileCoverage, { readonly status: "truncated" }> =>
      file.status === "truncated",
  );
  const skippedFiles = report.coverage.files.filter(
    (
      file,
    ): file is Extract<ReviewFileCoverage, { readonly status: "skipped" }> =>
      file.status === "skipped",
  );

  return [
    reviewSummaryText,
    "",
    `Review coverage incomplete: fully reviewed ${report.summary.reviewedFiles}, truncated ${report.summary.truncatedFiles}, and skipped ${report.summary.skippedFiles} of ${report.summary.changedFiles} changed file(s).`,
    ...(truncatedFiles.length === 0
      ? []
      : ["Truncated file(s):", ...truncatedFiles.map(renderTruncatedFile)]),
    ...(skippedFiles.length === 0 ? [] : ["Skipped file(s):"]),
    ...skippedFiles.map(renderSkippedFile),
    "",
    renderBudget(report),
  ].join("\n");
};

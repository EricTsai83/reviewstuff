import { expect, test } from "bun:test";
import type { ReviewReport } from "../../src/domain/report";
import {
  renderJsonReport,
  renderTerminalReport,
} from "../../src/output/report-renderer";

test("terminal reports escape control characters in untrusted fields", () => {
  const report: ReviewReport = {
    schemaVersion: 4,
    scope: "working-tree",
    summary: {
      changedFiles: 1,
      reviewedFiles: 1,
      truncatedFiles: 0,
      skippedFiles: 0,
      findings: 1,
    },
    coverage: {
      schemaVersion: 2,
      complete: true,
      files: [
        {
          path: "src/unsafe\u001b[31m.ts",
          source: "working-tree",
          status: "reviewed",
          selectedHunks: 1,
          totalHunks: 1,
        },
      ],
    },
    budget: {
      schemaVersion: 1,
      unit: "tokens",
      maxTokens: 128_000,
      fixedRequestOverheadTokens: 2_048,
      outputReserveTokens: 16_384,
      selectedRequestTokens: 512,
      totalReservedTokens: 18_944,
      fitsBudget: true,
    },
    findings: [
      {
        id: "finding-1",
        ruleId: "fake-marker",
        severity: "medium",
        category: "correctness",
        confidence: 1,
        message: "unsafe\nmessage\u001b]52;c;clipboard\u0007",
        file: "src/unsafe\u001b[31m.ts",
        line: 1,
      },
    ],
  };

  const output = renderTerminalReport(report);

  expect(output).toContain("src/unsafe\\u001b[31m.ts:1");
  expect(output).toContain("[medium/correctness confidence=1]");
  expect(output).toContain("unsafe\\u000amessage\\u001b]52;c;clipboard\\u0007");
  expect(output).not.toContain("\u001b");
  expect(output).not.toContain("\u0007");

  const jsonFinding = JSON.parse(renderJsonReport(report)) as {
    findings: ReadonlyArray<{
      severity: string;
      category: string;
      confidence: number;
    }>;
  };
  expect(jsonFinding.findings[0]).toMatchObject({
    severity: "medium",
    category: "correctness",
    confidence: 1,
  });
});

test("terminal reports incomplete coverage and skip reasons", () => {
  const report: ReviewReport = {
    schemaVersion: 4,
    scope: "working-tree",
    summary: {
      changedFiles: 3,
      reviewedFiles: 0,
      truncatedFiles: 1,
      skippedFiles: 2,
      findings: 0,
    },
    coverage: {
      schemaVersion: 2,
      complete: false,
      files: [
        {
          path: "src/partial.ts",
          source: "working-tree",
          status: "truncated",
          reason: "request-budget",
          selectedHunks: 1,
          totalHunks: 2,
        },
        {
          path: "assets/binary\u001b[31m.dat",
          source: "untracked",
          status: "skipped",
          reason: "binary",
        },
        {
          path: "fixtures/large.json",
          source: "working-tree",
          status: "skipped",
          reason: "file-too-large",
          sizeBytes: "600000",
          limitBytes: 524288,
        },
      ],
    },
    budget: {
      schemaVersion: 1,
      unit: "tokens",
      maxTokens: 128_000,
      fixedRequestOverheadTokens: 2_048,
      outputReserveTokens: 16_384,
      selectedRequestTokens: 256,
      totalReservedTokens: 18_688,
      fitsBudget: true,
    },
    findings: [],
  };

  const output = renderTerminalReport(report);

  expect(output).toContain(
    "Review coverage incomplete: fully reviewed 0, truncated 1, and skipped 2 of 3",
  );
  expect(output).toContain(
    "src/partial.ts [working-tree] — 1 of 2 hunks selected (request budget)",
  );
  expect(output).toContain("assets/binary\\u001b[31m.dat [untracked] — binary file");
  expect(output).toContain("600000 bytes exceeds the 524288 byte file limit");
  expect(output).not.toContain("\u001b");
  expect(output).toContain("Request budget: 18688 of 128000 tokens reserved");
});

test("terminal reports files skipped by the request budget", () => {
  const report: ReviewReport = {
    schemaVersion: 4,
    scope: "staged",
    summary: {
      changedFiles: 1,
      reviewedFiles: 0,
      truncatedFiles: 0,
      skippedFiles: 1,
      findings: 0,
    },
    coverage: {
      schemaVersion: 2,
      complete: false,
      files: [{
        path: "src/oversized.ts",
        source: "staged",
        status: "skipped",
        reason: "request-budget",
        selectedHunks: 0,
        totalHunks: 1,
      }],
    },
    budget: {
      schemaVersion: 1,
      unit: "tokens",
      maxTokens: 1_000,
      fixedRequestOverheadTokens: 500,
      outputReserveTokens: 400,
      selectedRequestTokens: 0,
      totalReservedTokens: 900,
      fitsBudget: true,
    },
    findings: [],
  };

  expect(renderTerminalReport(report)).toContain(
    "src/oversized.ts [staged] — 0 of 1 hunks selected (request budget)",
  );
});

import { expect, test } from "bun:test";
import type { ReviewReport } from "../../src/domain/report";
import {
  renderJsonReport,
  renderTerminalReport,
} from "../../src/output/report-renderer";

test("terminal reports escape control characters in untrusted fields", () => {
  const report: ReviewReport = {
    schemaVersion: 3,
    scope: "working-tree",
    summary: {
      changedFiles: 1,
      reviewedFiles: 1,
      skippedFiles: 0,
      findings: 1,
    },
    coverage: {
      schemaVersion: 1,
      complete: true,
      files: [
        {
          path: "src/unsafe\u001b[31m.ts",
          source: "working-tree",
          status: "reviewed",
        },
      ],
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
    schemaVersion: 3,
    scope: "working-tree",
    summary: {
      changedFiles: 2,
      reviewedFiles: 0,
      skippedFiles: 2,
      findings: 0,
    },
    coverage: {
      schemaVersion: 1,
      complete: false,
      files: [
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
    findings: [],
  };

  const output = renderTerminalReport(report);

  expect(output).toContain("Review coverage incomplete: reviewed 0 of 2");
  expect(output).toContain("assets/binary\\u001b[31m.dat [untracked] — binary file");
  expect(output).toContain("600000 bytes exceeds the 524288 byte file limit");
  expect(output).not.toContain("\u001b");
});

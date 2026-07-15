import { expect, test } from "bun:test";
import type { ReviewReport } from "../../src/domain/report";
import { renderTerminalReport } from "../../src/output/report-renderer";

test("terminal reports escape control characters in untrusted fields", () => {
  const report: ReviewReport = {
    schemaVersion: 1,
    scope: "working-tree",
    summary: { changedFiles: 1, findings: 1 },
    findings: [
      {
        id: "finding-1",
        ruleId: "fake-marker",
        severity: "warning",
        message: "unsafe\nmessage\u001b]52;c;clipboard\u0007",
        file: "src/unsafe\u001b[31m.ts",
        line: 1,
      },
    ],
  };

  const output = renderTerminalReport(report);

  expect(output).toContain("src/unsafe\\u001b[31m.ts:1");
  expect(output).toContain("unsafe\\u000amessage\\u001b]52;c;clipboard\\u0007");
  expect(output).not.toContain("\u001b");
  expect(output).not.toContain("\u0007");
});

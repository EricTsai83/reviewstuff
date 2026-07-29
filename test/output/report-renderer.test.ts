import { expect, test } from "bun:test";
import type { ReviewReport } from "../../src/domain/report";
import {
  renderJsonReport,
  renderTerminalReport,
} from "../../src/output/report-renderer";

test("terminal reports escape control characters in untrusted fields", () => {
  const report: ReviewReport = {
    schemaVersion: 7,
    scope: "working-tree",
    privacy: {
      mode: "local-only",
      transport: "local",
      decision: "allowed",
    },
    privacyEvidence: "recorded",
    workload: "standard",
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
    redaction: { schemaVersion: 1, totalRedactions: 0, reasons: [] },
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
    schemaVersion: 7,
    scope: "working-tree",
    privacy: {
      mode: "local-only",
      transport: "local",
      decision: "allowed",
    },
    privacyEvidence: "recorded",
    workload: "light",
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
    redaction: { schemaVersion: 1, totalRedactions: 0, reasons: [] },
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
  expect(output).toContain("Review workload: light.");
  expect(output).toContain("Request budget: 18688 of 128000 tokens reserved");
});

test("terminal reports files skipped by the request budget", () => {
  const report: ReviewReport = {
    schemaVersion: 7,
    scope: "staged",
    privacy: {
      mode: "local-only",
      transport: "local",
      decision: "allowed",
    },
    privacyEvidence: "recorded",
    workload: "standard",
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
    redaction: { schemaVersion: 1, totalRedactions: 0, reasons: [] },
    findings: [],
  };

  expect(renderTerminalReport(report)).toContain(
    "src/oversized.ts [staged] — 0 of 1 hunks selected (request budget)",
  );
});

test("terminal reports state redaction only when the payload carried it", () => {
  const base: ReviewReport = {
    schemaVersion: 7,
    scope: "working-tree",
    privacy: { mode: "cloud-allowed", transport: "cloud", decision: "allowed" },
    privacyEvidence: "recorded",
    workload: "standard",
    summary: {
      changedFiles: 1,
      reviewedFiles: 1,
      truncatedFiles: 0,
      skippedFiles: 0,
      findings: 0,
    },
    coverage: {
      schemaVersion: 2,
      complete: true,
      files: [{
        path: "src/keys.ts",
        source: "working-tree",
        status: "reviewed",
        selectedHunks: 1,
        totalHunks: 1,
      }],
    },
    budget: {
      schemaVersion: 1,
      unit: "tokens",
      maxTokens: 128_000,
      fixedRequestOverheadTokens: 100,
      outputReserveTokens: 16_384,
      selectedRequestTokens: 200,
      totalReservedTokens: 16_684,
      fitsBudget: true,
    },
    redaction: { schemaVersion: 1, totalRedactions: 0, reasons: [] },
    findings: [],
  };

  expect(renderTerminalReport(base)).not.toContain("Redacted");
  expect(
    renderTerminalReport({
      ...base,
      redaction: {
        schemaVersion: 1,
        totalRedactions: 3,
        reasons: [
          { reason: "api-key", count: 2 },
          { reason: "private-key", count: 1 },
        ],
      },
    }),
  ).toContain(
    "Redacted 3 secret(s) before sending: api-key 2, private-key 1.",
  );
});

test("machine output escapes what the terminal renderer escapes", () => {
  const report: ReviewReport = {
    schemaVersion: 7,
    scope: "working-tree",
    privacy: { mode: "local-only", transport: "local", decision: "allowed" },
    privacyEvidence: "recorded",
    workload: "standard",
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
      files: [{
        path: "src/unsafe.ts",
        source: "working-tree",
        status: "reviewed",
        selectedHunks: 1,
        totalHunks: 1,
      }],
    },
    budget: {
      schemaVersion: 1,
      unit: "tokens",
      maxTokens: 128_000,
      fixedRequestOverheadTokens: 100,
      outputReserveTokens: 16_384,
      selectedRequestTokens: 200,
      totalReservedTokens: 16_684,
      fitsBudget: true,
    },
    redaction: { schemaVersion: 1, totalRedactions: 0, reasons: [] },
    findings: [{
      id: "finding-1",
      ruleId: "fake-marker",
      severity: "medium",
      category: "correctness",
      confidence: 1,
      // C1 control, line separator, and paragraph separator: valid JSON string
      // characters that break line-oriented consumers if emitted literally.
      message: "next\u0085line\u2028break\u2029end",
      file: "src/unsafe.ts",
      line: 1,
    }],
  };

  const json = renderJsonReport(report);

  expect(json).not.toContain("\u0085");
  expect(json).not.toContain("\u2028");
  expect(json).not.toContain("\u2029");
  expect(json).toContain("next\\u0085line\\u2028break\\u2029end");
  expect(JSON.parse(json)).toEqual(
    JSON.parse(JSON.stringify(report)),
  );
});

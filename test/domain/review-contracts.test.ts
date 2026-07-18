import { expect, test } from "bun:test";
import {
  decodeReviewFindingV1,
} from "../../src/domain/finding";
import {
  decodeReviewReport,
  decodeReviewReportV3,
  decodeReviewReportV4,
} from "../../src/domain/report";

const readFixture = async (name: string): Promise<unknown> =>
  JSON.parse(
    await Bun.file(
      `${import.meta.dir}/../fixtures/reports/${name}`,
    ).text(),
  );

test("current report fixture passes the strict v4 decode boundary", async () => {
  const fixture = await readFixture("review-report-v4.json");

  expect(JSON.stringify(decodeReviewReport(fixture))).toBe(
    JSON.stringify(fixture),
  );
  expect(JSON.stringify(decodeReviewReportV4(fixture))).toBe(
    JSON.stringify(fixture),
  );
});

test("v4 rejects contradictory summary, coverage, and budget values", async () => {
  const report = decodeReviewReportV4(
    await readFixture("review-report-v4.json"),
  );
  const reviewedFile = report.coverage.files[0];
  if (reviewedFile?.status !== "reviewed") {
    throw new Error("Expected the v4 fixture to start with a reviewed file");
  }

  const invalidReports: ReadonlyArray<unknown> = [
    {
      ...report,
      summary: { ...report.summary, changedFiles: 0 },
    },
    {
      ...report,
      coverage: { ...report.coverage, complete: true },
    },
    {
      ...report,
      coverage: {
        ...report.coverage,
        files: [
          { ...reviewedFile, selectedHunks: 2, totalHunks: 1 },
          ...report.coverage.files.slice(1),
        ],
      },
    },
    {
      ...report,
      budget: { ...report.budget, totalReservedTokens: 0 },
    },
    {
      ...report,
      budget: { ...report.budget, fitsBudget: false },
    },
  ];

  for (const invalidReport of invalidReports) {
    expect(() => decodeReviewReportV4(invalidReport)).toThrow(
      "Invalid review report",
    );
  }
});

test("previous v3 fixture is strictly decoded and explicitly migrated", async () => {
  const fixture = await readFixture("review-report-v3.json");
  const migrated = decodeReviewReport(fixture);

  expect(migrated).toMatchObject({
    schemaVersion: 4,
    summary: { truncatedFiles: 0 },
    coverage: { schemaVersion: 2 },
    budget: { totalReservedTokens: 0, fitsBudget: true },
  });
  expect(() => decodeReviewReportV4(fixture)).toThrow();
  expect(decodeReviewReportV3(fixture).schemaVersion).toBe(3);
});

test("v2 fixtures still migrate through v3 to the current report", async () => {
  const migrated = decodeReviewReport(await readFixture("review-report-v2.json"));

  expect(migrated.schemaVersion).toBe(4);
  expect(migrated.findings[0]).toMatchObject({
    severity: "medium",
    category: "correctness",
    confidence: 1,
  });
});

test("unknown report versions are refused instead of guessed", () => {
  expect(() => decodeReviewReport({ schemaVersion: 5 })).toThrow(
    "Unsupported review report schema version: 5",
  );
});

test.each([
  ["unknown severity", { severity: "warning" }],
  ["unknown category", { category: "provider-special" }],
  ["confidence above one", { confidence: 1.01 }],
  ["non-positive line", { line: 0 }],
  ["provider-specific field", { provider: "fake" }],
])("finding rejects %s", (_name, override) => {
  const finding: Record<string, unknown> = {
    id: "finding-1",
    ruleId: "fake-marker",
    severity: "medium",
    category: "correctness",
    confidence: 1,
    message: "A finding.",
    file: "src/example.ts",
    line: 1,
    ...override,
  };

  expect(() => decodeReviewFindingV1(finding)).toThrow();
});

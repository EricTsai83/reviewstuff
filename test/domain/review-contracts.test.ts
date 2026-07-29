import { expect, test } from "bun:test";
import {
  decodeReviewFindingV1,
} from "../../src/domain/finding";
import {
  decodeReviewReport,
  decodeReviewReportV3,
  decodeReviewReportV4,
  decodeReviewReportV5,
  decodeReviewReportV6,
  decodeReviewReportV7,
} from "../../src/domain/report";

const readFixture = async (name: string): Promise<unknown> =>
  JSON.parse(
    await Bun.file(
      `${import.meta.dir}/../fixtures/reports/${name}`,
    ).text(),
  );

test("current report fixture passes the strict v7 decode boundary", async () => {
  const fixture = await readFixture("review-report-v7.json");

  expect(JSON.stringify(decodeReviewReport(fixture))).toBe(
    JSON.stringify(fixture),
  );
  expect(JSON.stringify(decodeReviewReportV7(fixture))).toBe(
    JSON.stringify(fixture),
  );
});

test("v7 rejects a redaction summary that contradicts its reasons", async () => {
  const report = decodeReviewReportV7(
    await readFixture("review-report-v7.json"),
  );

  expect(() =>
    decodeReviewReportV7({
      ...report,
      redaction: { ...report.redaction, totalRedactions: 99 },
    })
  ).toThrow("redaction summary total does not match reasons");
  expect(() =>
    decodeReviewReportV7({
      ...report,
      redaction: {
        schemaVersion: 1,
        totalRedactions: 2,
        reasons: [
          { reason: "api-key", count: 1 },
          { reason: "api-key", count: 1 },
        ],
      },
    })
  ).toThrow("redaction summary duplicate reason");
});

test("previous v6 fixture migrates with recorded privacy and no redaction evidence", async () => {
  const fixture = await readFixture("review-report-v6.json");
  const migrated = decodeReviewReport(fixture);

  expect(migrated.schemaVersion).toBe(7);
  // v6 recorded a real privacy decision, so the marker stays "recorded"; the
  // report predates redaction evidence, so the summary is empty.
  expect(migrated.privacyEvidence).toBe("recorded");
  expect(migrated.redaction).toEqual({
    schemaVersion: 1,
    totalRedactions: 0,
    reasons: [],
  });
  expect(() => decodeReviewReportV7(fixture)).toThrow();
});

test("v6 rejects invalid workload, privacy, and contradictory values", async () => {
  const report = decodeReviewReportV6(
    await readFixture("review-report-v6.json"),
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
    expect(() => decodeReviewReportV6(invalidReport)).toThrow(
      "Invalid review report",
    );
  }

  expect(() =>
    decodeReviewReportV6({
      ...report,
      privacy: { ...report.privacy, decision: "refused" },
    })
  ).toThrow('Expected "allowed", got "refused"');
  expect(() =>
    decodeReviewReportV6({
      ...report,
      privacy: {
        mode: "local-only",
        transport: "cloud",
        decision: "allowed",
      },
    })
  ).toThrow();
  expect(() =>
    decodeReviewReportV6({
      ...report,
      workload: "deep",
    })
  ).toThrow();
});

test("previous v5 fixture defaults workload to standard when migrated", async () => {
  const fixture = await readFixture("review-report-v5.json");
  const migrated = decodeReviewReport(fixture);

  expect(migrated).toMatchObject({
    schemaVersion: 7,
    workload: "standard",
    privacy: {
      mode: "cloud-allowed",
      transport: "cloud",
      decision: "allowed",
    },
  });
  expect(() => decodeReviewReportV6(fixture)).toThrow();
  expect(decodeReviewReportV5(fixture).schemaVersion).toBe(5);
});

test("v4 fixture migrates through v5 to the current report", async () => {
  const fixture = await readFixture("review-report-v4.json");
  const migrated = decodeReviewReport(fixture);

  expect(migrated).toMatchObject({
    schemaVersion: 7,
    workload: "standard",
    privacy: {
      mode: "local-only",
      transport: "local",
      decision: "allowed",
    },
  });
  expect(() => decodeReviewReportV5(fixture)).toThrow();
  expect(decodeReviewReportV4(fixture).schemaVersion).toBe(4);
});

test("v3 fixture migrates through v4 to the current report", async () => {
  const fixture = await readFixture("review-report-v3.json");
  const migrated = decodeReviewReport(fixture);

  expect(migrated).toMatchObject({
    schemaVersion: 7,
    workload: "standard",
    privacy: { mode: "local-only", transport: "local", decision: "allowed" },
    summary: { truncatedFiles: 0 },
    coverage: { schemaVersion: 2 },
    budget: { totalReservedTokens: 0, fitsBudget: true },
  });
  expect(() => decodeReviewReportV4(fixture)).toThrow();
  expect(decodeReviewReportV3(fixture).schemaVersion).toBe(3);
});

test("v2 fixtures still migrate through v3 and v4 to the current report", async () => {
  const migrated = decodeReviewReport(await readFixture("review-report-v2.json"));

  expect(migrated.schemaVersion).toBe(7);
  // A pre-v5 report has no observed privacy decision, so the migrated value is
  // marked as assumed rather than presented as evidence.
  expect(migrated.privacyEvidence).toBe("assumed-by-migration");
  expect(migrated.redaction).toEqual({
    schemaVersion: 1,
    totalRedactions: 0,
    reasons: [],
  });
  expect(migrated.findings[0]).toMatchObject({
    severity: "medium",
    category: "correctness",
    confidence: 1,
  });
});

test("unknown report versions are refused instead of guessed", () => {
  expect(() => decodeReviewReport({ schemaVersion: 8 })).toThrow(
    "Unsupported review report schema version: 8",
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

import { expect, test } from "bun:test";
import {
  decodeReviewFindingV1,
} from "../../src/domain/finding";
import {
  decodeReviewReport,
  decodeReviewReportV3,
} from "../../src/domain/report";

const readFixture = async (name: string): Promise<unknown> =>
  JSON.parse(
    await Bun.file(
      `${import.meta.dir}/../fixtures/reports/${name}`,
    ).text(),
  );

test("current report fixture passes the strict v3 decode boundary", async () => {
  const fixture = await readFixture("review-report-v3.json");

  expect(JSON.stringify(decodeReviewReport(fixture))).toBe(
    JSON.stringify(fixture),
  );
  expect(JSON.stringify(decodeReviewReportV3(fixture))).toBe(
    JSON.stringify(fixture),
  );
});

test("previous v2 fixture is strictly decoded and explicitly migrated", async () => {
  const fixture = await readFixture("review-report-v2.json");
  const migrated = decodeReviewReport(fixture);

  expect(migrated.schemaVersion).toBe(3);
  expect(migrated.findings[0]).toMatchObject({
    severity: "medium",
    category: "correctness",
    confidence: 1,
  });
  expect(() => decodeReviewReportV3(fixture)).toThrow();
});

test("unknown report versions are refused instead of guessed", () => {
  expect(() => decodeReviewReport({ schemaVersion: 4 })).toThrow(
    "Unsupported review report schema version: 4",
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

import * as Schema from "effect/Schema";
import { ReviewFindingV1Schema } from "./finding";

const NonNegativeIntegerSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0, { message: "must not be negative" }),
);
const NonEmptyStringSchema = Schema.String.check(
  Schema.isMinLength(1, { message: "must not be empty" }),
);

const ReviewScopeSchema = Schema.Literals(["working-tree", "staged"]);
const ReviewFileSourceSchema = Schema.Literals([
  "staged",
  "working-tree",
  "untracked",
]);

const ReviewedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("reviewed"),
});
const BinarySkippedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("skipped"),
  reason: Schema.Literal("binary"),
});
const LargeSkippedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("skipped"),
  reason: Schema.Literal("file-too-large"),
  sizeBytes: Schema.String.check(Schema.isPattern(/^\d+$/u)),
  limitBytes: Schema.Int.check(
    Schema.isGreaterThan(0, { message: "must be greater than 0" }),
  ),
});

const ReviewCoverageV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  complete: Schema.Boolean,
  files: Schema.Array(
    Schema.Union([
      ReviewedFileCoverageSchema,
      BinarySkippedFileCoverageSchema,
      LargeSkippedFileCoverageSchema,
    ]),
  ),
});

export const ReviewReportSummarySchema = Schema.Struct({
  changedFiles: NonNegativeIntegerSchema,
  reviewedFiles: NonNegativeIntegerSchema,
  skippedFiles: NonNegativeIntegerSchema,
  findings: NonNegativeIntegerSchema,
});

export const ReviewReportV3Schema = Schema.Struct({
  schemaVersion: Schema.Literal(3),
  scope: ReviewScopeSchema,
  summary: ReviewReportSummarySchema,
  coverage: ReviewCoverageV1Schema,
  findings: Schema.Array(ReviewFindingV1Schema),
});

const ReviewFindingV0Schema = Schema.Struct({
  id: NonEmptyStringSchema,
  ruleId: Schema.Literal("fake-marker"),
  severity: Schema.Literal("warning"),
  message: NonEmptyStringSchema,
  file: NonEmptyStringSchema,
  line: Schema.Int.check(
    Schema.isGreaterThan(0, { message: "must be greater than 0" }),
  ),
});

export const ReviewReportV2Schema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  scope: ReviewScopeSchema,
  summary: ReviewReportSummarySchema,
  coverage: ReviewCoverageV1Schema,
  findings: Schema.Array(ReviewFindingV0Schema),
});

export type ReviewReportSummary = typeof ReviewReportSummarySchema.Type;
export type ReviewReportV3 = typeof ReviewReportV3Schema.Type;
export type ReviewReportV2 = typeof ReviewReportV2Schema.Type;
export type ReviewReport = ReviewReportV3;

export const decodeReviewReportV3 = (input: unknown): ReviewReportV3 =>
  Schema.decodeUnknownSync(ReviewReportV3Schema)(input, {
    onExcessProperty: "error",
  });

const decodeReviewReportV2 = (input: unknown): ReviewReportV2 =>
  Schema.decodeUnknownSync(ReviewReportV2Schema)(input, {
    onExcessProperty: "error",
  });

export const migrateReviewReportV2 = (
  report: ReviewReportV2,
): ReviewReportV3 =>
  decodeReviewReportV3({
    ...report,
    schemaVersion: 3,
    findings: report.findings.map((finding) => ({
      ...finding,
      severity: "medium",
      category: "correctness",
      confidence: 1,
    })),
  });

const readSchemaVersion = (input: unknown): unknown =>
  typeof input === "object" && input !== null && "schemaVersion" in input
    ? input.schemaVersion
    : undefined;

export const decodeReviewReport = (input: unknown): ReviewReportV3 => {
  const schemaVersion = readSchemaVersion(input);

  if (schemaVersion === 3) {
    return decodeReviewReportV3(input);
  }

  if (schemaVersion === 2) {
    return migrateReviewReportV2(decodeReviewReportV2(input));
  }

  throw new Error(
    `Unsupported review report schema version: ${String(schemaVersion)}; supported versions are 2 and 3`,
  );
};

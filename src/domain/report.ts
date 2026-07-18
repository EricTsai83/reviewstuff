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
const BudgetedReviewedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("reviewed"),
  selectedHunks: NonNegativeIntegerSchema,
  totalHunks: NonNegativeIntegerSchema,
});
const TruncatedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("truncated"),
  reason: Schema.Literal("request-budget"),
  selectedHunks: NonNegativeIntegerSchema,
  totalHunks: NonNegativeIntegerSchema,
});
const RequestBudgetSkippedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("skipped"),
  reason: Schema.Literal("request-budget"),
  selectedHunks: Schema.Literal(0),
  totalHunks: NonNegativeIntegerSchema,
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

const ReviewCoverageV2Schema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  complete: Schema.Boolean,
  files: Schema.Array(
    Schema.Union([
      BudgetedReviewedFileCoverageSchema,
      TruncatedFileCoverageSchema,
      RequestBudgetSkippedFileCoverageSchema,
      BinarySkippedFileCoverageSchema,
      LargeSkippedFileCoverageSchema,
    ]),
  ),
});

const ReviewBudgetEstimateV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  unit: Schema.Literal("tokens"),
  maxTokens: NonNegativeIntegerSchema,
  fixedRequestOverheadTokens: NonNegativeIntegerSchema,
  outputReserveTokens: NonNegativeIntegerSchema,
  selectedRequestTokens: NonNegativeIntegerSchema,
  totalReservedTokens: NonNegativeIntegerSchema,
  fitsBudget: Schema.Boolean,
});

export const ReviewReportSummarySchema = Schema.Struct({
  changedFiles: NonNegativeIntegerSchema,
  reviewedFiles: NonNegativeIntegerSchema,
  skippedFiles: NonNegativeIntegerSchema,
  findings: NonNegativeIntegerSchema,
});

export const ReviewReportSummaryV4Schema = Schema.Struct({
  changedFiles: NonNegativeIntegerSchema,
  reviewedFiles: NonNegativeIntegerSchema,
  truncatedFiles: NonNegativeIntegerSchema,
  skippedFiles: NonNegativeIntegerSchema,
  findings: NonNegativeIntegerSchema,
});

export const ReviewReportV4Schema = Schema.Struct({
  schemaVersion: Schema.Literal(4),
  scope: ReviewScopeSchema,
  summary: ReviewReportSummaryV4Schema,
  coverage: ReviewCoverageV2Schema,
  budget: ReviewBudgetEstimateV1Schema,
  findings: Schema.Array(ReviewFindingV1Schema),
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

export type ReviewReportSummaryV3 = typeof ReviewReportSummarySchema.Type;
export type ReviewReportSummaryV4 = typeof ReviewReportSummaryV4Schema.Type;
export type ReviewReportSummary = ReviewReportSummaryV4;
export type ReviewReportV4 = typeof ReviewReportV4Schema.Type;
export type ReviewReportV3 = typeof ReviewReportV3Schema.Type;
export type ReviewReportV2 = typeof ReviewReportV2Schema.Type;
export type ReviewReport = ReviewReportV4;

export const decodeReviewReportV4 = (input: unknown): ReviewReportV4 =>
  Schema.decodeUnknownSync(ReviewReportV4Schema)(input, {
    onExcessProperty: "error",
  });

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

export const migrateReviewReportV3 = (
  report: ReviewReportV3,
): ReviewReportV4 =>
  decodeReviewReportV4({
    ...report,
    schemaVersion: 4,
    summary: {
      ...report.summary,
      truncatedFiles: 0,
    },
    coverage: {
      schemaVersion: 2,
      complete: report.coverage.complete,
      files: report.coverage.files.map((file) =>
        file.status === "reviewed"
          ? { ...file, selectedHunks: 0, totalHunks: 0 }
          : file
      ),
    },
    budget: {
      schemaVersion: 1,
      unit: "tokens",
      maxTokens: 0,
      fixedRequestOverheadTokens: 0,
      outputReserveTokens: 0,
      selectedRequestTokens: 0,
      totalReservedTokens: 0,
      fitsBudget: true,
    },
  });

const readSchemaVersion = (input: unknown): unknown =>
  typeof input === "object" && input !== null && "schemaVersion" in input
    ? input.schemaVersion
    : undefined;

export const decodeReviewReport = (input: unknown): ReviewReportV4 => {
  const schemaVersion = readSchemaVersion(input);

  if (schemaVersion === 4) {
    return decodeReviewReportV4(input);
  }

  if (schemaVersion === 3) {
    return migrateReviewReportV3(decodeReviewReportV3(input));
  }

  if (schemaVersion === 2) {
    return migrateReviewReportV3(
      migrateReviewReportV2(decodeReviewReportV2(input)),
    );
  }

  throw new Error(
    `Unsupported review report schema version: ${String(schemaVersion)}; supported versions are 2, 3, and 4`,
  );
};

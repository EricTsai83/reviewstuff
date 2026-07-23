import * as Schema from "effect/Schema";
import {
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
} from "../shared/schema-primitives";

export const ReviewFileSourceSchema = Schema.Literals([
  "staged",
  "working-tree",
  "untracked",
]);

export type ReviewFileSource = typeof ReviewFileSourceSchema.Type;

export const LegacyReviewedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("reviewed"),
});

export const ReviewedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("reviewed"),
  selectedHunks: NonNegativeIntegerSchema,
  totalHunks: NonNegativeIntegerSchema,
});

export const TruncatedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("truncated"),
  reason: Schema.Literal("request-budget"),
  selectedHunks: NonNegativeIntegerSchema,
  totalHunks: NonNegativeIntegerSchema,
});

export const RequestBudgetSkippedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("skipped"),
  reason: Schema.Literal("request-budget"),
  selectedHunks: Schema.Literal(0),
  totalHunks: NonNegativeIntegerSchema,
});

export const BinarySkippedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("skipped"),
  reason: Schema.Literal("binary"),
});

export const LargeSkippedFileCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("skipped"),
  reason: Schema.Literal("file-too-large"),
  sizeBytes: Schema.String.check(Schema.isPattern(/^\d+$/u)),
  limitBytes: PositiveIntegerSchema,
});

export type ReviewedFileCoverage = typeof ReviewedFileCoverageSchema.Type;
export type TruncatedFileCoverage = typeof TruncatedFileCoverageSchema.Type;

export type ReviewFileCoverage =
  | ReviewedFileCoverage
  | TruncatedFileCoverage
  | typeof RequestBudgetSkippedFileCoverageSchema.Type
  | typeof BinarySkippedFileCoverageSchema.Type
  | typeof LargeSkippedFileCoverageSchema.Type;

export interface ReviewFileIdentity {
  readonly path: string;
  readonly source: ReviewFileSource;
}

export const compareReviewFileIdentity = (
  left: ReviewFileIdentity,
  right: ReviewFileIdentity,
): number =>
  left.path < right.path
    ? -1
    : left.path > right.path
    ? 1
    : left.source < right.source
    ? -1
    : left.source > right.source
    ? 1
    : 0;

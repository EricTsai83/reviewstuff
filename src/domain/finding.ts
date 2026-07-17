import * as Schema from "effect/Schema";

const NonEmptyStringSchema = Schema.String.check(
  Schema.isMinLength(1, { message: "must not be empty" }),
);

export const FindingSeveritySchema = Schema.Literals([
  "critical",
  "high",
  "medium",
  "low",
]);

export const FindingCategorySchema = Schema.Literals([
  "correctness",
  "security",
  "performance",
  "maintainability",
]);

export const FindingConfidenceSchema = Schema.Number.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }),
);

export const ReviewFindingV1Schema = Schema.Struct({
  id: NonEmptyStringSchema,
  ruleId: NonEmptyStringSchema,
  severity: FindingSeveritySchema,
  category: FindingCategorySchema,
  confidence: FindingConfidenceSchema,
  message: NonEmptyStringSchema,
  file: NonEmptyStringSchema,
  line: Schema.Int.check(
    Schema.isGreaterThan(0, { message: "must be greater than 0" }),
  ),
});

export type FindingSeverity = typeof FindingSeveritySchema.Type;
export type FindingCategory = typeof FindingCategorySchema.Type;
export type ReviewFindingV1 = typeof ReviewFindingV1Schema.Type;

export const decodeReviewFindingV1 = (
  input: unknown,
): ReviewFindingV1 =>
  Schema.decodeUnknownSync(ReviewFindingV1Schema)(input, {
    onExcessProperty: "error",
  });

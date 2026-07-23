import * as Schema from "effect/Schema";

export const reviewConfigFileName = "reviewstuff.config.json";

export const ReviewPresetNameSchema = Schema.Literals(["quick", "standard"]);

const NonEmptyStringSchema = Schema.String.check(
  Schema.isMinLength(1, { message: "must not be empty" }),
);
const PositiveIntegerSchema = Schema.Int.check(
  Schema.isGreaterThan(0, { message: "must be greater than 0" }),
);
const NonNegativeIntegerSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0, { message: "must not be negative" }),
);

export const ReviewRequestBudgetConfigSchema = Schema.Struct({
  maxTokens: PositiveIntegerSchema,
  fixedRequestOverheadTokens: NonNegativeIntegerSchema,
  outputReserveTokens: NonNegativeIntegerSchema,
});

export const ReviewConfigSchema = Schema.Struct({
  preset: Schema.optionalKey(ReviewPresetNameSchema),
  engine: Schema.optionalKey(NonEmptyStringSchema),
  provider: Schema.optionalKey(NonEmptyStringSchema),
  model: Schema.optionalKey(NonEmptyStringSchema),
  timeoutMs: Schema.optionalKey(PositiveIntegerSchema),
  concurrency: Schema.optionalKey(PositiveIntegerSchema),
  requestBudget: Schema.optionalKey(ReviewRequestBudgetConfigSchema),
});

export const ReviewstuffConfigV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  review: Schema.optionalKey(ReviewConfigSchema),
});

export const ReviewstuffConfigJsonSchema = Schema.fromJsonString(
  ReviewstuffConfigV1Schema,
);

export type ReviewPresetName = typeof ReviewPresetNameSchema.Type;
export type ReviewRequestBudgetConfig =
  typeof ReviewRequestBudgetConfigSchema.Type;
export type ReviewConfig = typeof ReviewConfigSchema.Type;
export type ReviewstuffConfigV1 = typeof ReviewstuffConfigV1Schema.Type;

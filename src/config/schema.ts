import * as Schema from "effect/Schema";

export const reviewConfigFileName = "reviewstuff.config.json";

export const ReviewProfileSchema = Schema.Literals(["quick", "standard"]);

const NonEmptyStringSchema = Schema.String.check(
  Schema.isMinLength(1, { message: "must not be empty" }),
);
const PositiveIntegerSchema = Schema.Int.check(
  Schema.isGreaterThan(0, { message: "must be greater than 0" }),
);

export const ReviewConfigSchema = Schema.Struct({
  profile: Schema.optionalKey(ReviewProfileSchema),
  engine: Schema.optionalKey(NonEmptyStringSchema),
  provider: Schema.optionalKey(NonEmptyStringSchema),
  model: Schema.optionalKey(NonEmptyStringSchema),
  timeoutMs: Schema.optionalKey(PositiveIntegerSchema),
  concurrency: Schema.optionalKey(PositiveIntegerSchema),
});

export const ReviewstuffConfigV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  review: Schema.optionalKey(ReviewConfigSchema),
});

export const ReviewstuffConfigJsonSchema = Schema.fromJsonString(
  ReviewstuffConfigV1Schema,
);

export type ReviewProfile = typeof ReviewProfileSchema.Type;
export type ReviewConfig = typeof ReviewConfigSchema.Type;
export type ReviewstuffConfigV1 = typeof ReviewstuffConfigV1Schema.Type;


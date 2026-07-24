import * as Schema from "effect/Schema";
import {
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
} from "../shared/schema-primitives";

export const reviewConfigFileName = "reviewstuff.config.json";

export const ReviewPresetNameSchema = Schema.Literals(["quick", "standard"]);

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

export const ReviewstuffConfigSchema = Schema.Struct({
  review: Schema.optionalKey(ReviewConfigSchema),
});

export const ReviewstuffConfigJsonSchema = Schema.fromJsonString(
  ReviewstuffConfigSchema,
);

export type ReviewPresetName = typeof ReviewPresetNameSchema.Type;
export type ReviewRequestBudgetConfig =
  typeof ReviewRequestBudgetConfigSchema.Type;
export type ReviewstuffConfig = typeof ReviewstuffConfigSchema.Type;

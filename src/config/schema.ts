import * as Schema from "effect/Schema";
import {
  NonEmptyStringSchema,
  PositiveIntegerSchema,
} from "../shared/schema-primitives";
import { ReviewPrivacyModeSchema } from "../domain/privacy";
import {
  ReviewRequestBudgetConfigSchema,
  ReviewWorkloadSchema,
} from "../domain/workload";

export const reviewConfigFileName = ".reviewstuff.yaml";

export const ReviewConfigSchema = Schema.Struct({
  workload: Schema.optionalKey(ReviewWorkloadSchema),
  privacy: Schema.optionalKey(ReviewPrivacyModeSchema),
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

export type ReviewstuffConfig = typeof ReviewstuffConfigSchema.Type;

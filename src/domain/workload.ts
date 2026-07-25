import * as Schema from "effect/Schema";
import {
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
} from "../shared/schema-primitives";

export const ReviewWorkloadSchema = Schema.Literals(["standard", "light"]);

export const ReviewRequestBudgetConfigSchema = Schema.Struct({
  maxTokens: PositiveIntegerSchema,
  fixedRequestOverheadTokens: NonNegativeIntegerSchema,
  outputReserveTokens: NonNegativeIntegerSchema,
});

export type ReviewWorkload = typeof ReviewWorkloadSchema.Type;
export type ReviewRequestBudgetConfig =
  typeof ReviewRequestBudgetConfigSchema.Type;

export interface ReviewWorkloadPreset {
  readonly workload: ReviewWorkload;
  readonly requestBudget: ReviewRequestBudgetConfig;
}

export const reviewWorkloadPresets: Readonly<
  Record<ReviewWorkload, ReviewWorkloadPreset>
> = {
  standard: {
    workload: "standard",
    requestBudget: {
      maxTokens: 128_000,
      fixedRequestOverheadTokens: 2_048,
      outputReserveTokens: 16_384,
    },
  },
  light: {
    workload: "light",
    requestBudget: {
      maxTokens: 32_000,
      fixedRequestOverheadTokens: 2_048,
      outputReserveTokens: 8_192,
    },
  },
};

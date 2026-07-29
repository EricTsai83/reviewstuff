import * as Schema from "effect/Schema";
import {
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
} from "../shared/schema-primitives";

export const ReviewRedactionReasonSchema = Schema.Union([
  Schema.Literal("api-key"),
  Schema.Literal("private-key"),
  Schema.Literal("high-entropy-token"),
]);

const ReviewRedactionReasonCountV1Schema = Schema.Struct({
  reason: ReviewRedactionReasonSchema,
  count: PositiveIntegerSchema,
});

/**
 * How many spans the sanitization boundary replaced in the payload that was
 * sent, grouped by reason. A reason with no redactions is absent rather than
 * present with a zero count, so the list is evidence and not a template.
 */
export const ReviewRedactionSummaryV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  totalRedactions: NonNegativeIntegerSchema,
  reasons: Schema.Array(ReviewRedactionReasonCountV1Schema),
});

export type ReviewRedactionReason = typeof ReviewRedactionReasonSchema.Type;
export type ReviewRedactionSummaryV1 =
  typeof ReviewRedactionSummaryV1Schema.Type;

/**
 * Rejects a summary whose reasons repeat or whose total disagrees with them.
 * Used by both the request boundary and the report contract.
 */
export const validateReviewRedactionSummary = <
  Summary extends ReviewRedactionSummaryV1,
>(
  summary: Summary,
  invalid: (reason: string) => never,
): Summary => {
  const reasons = new Set<ReviewRedactionReason>();
  let totalRedactions = 0;

  for (const item of summary.reasons) {
    if (reasons.has(item.reason)) {
      return invalid("duplicate reason");
    }

    reasons.add(item.reason);
    totalRedactions += item.count;
  }

  return totalRedactions === summary.totalRedactions
    ? summary
    : invalid("total does not match reasons");
};

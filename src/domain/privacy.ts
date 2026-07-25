import * as Schema from "effect/Schema";

export const ReviewPrivacyModeSchema = Schema.Literals([
  "local-only",
  "cloud-allowed",
]);

export const ReviewTransportSchema = Schema.Literals(["local", "cloud"]);

export const ReviewAllowedPrivacyDecisionSchema = Schema.Union([
  Schema.Struct({
    mode: Schema.Literal("local-only"),
    transport: Schema.Literal("local"),
    decision: Schema.Literal("allowed"),
  }),
  Schema.Struct({
    mode: Schema.Literal("cloud-allowed"),
    transport: ReviewTransportSchema,
    decision: Schema.Literal("allowed"),
  }),
]);

export const ReviewRefusedPrivacyDecisionSchema = Schema.Struct({
  mode: Schema.Literal("local-only"),
  transport: Schema.Literal("cloud"),
  decision: Schema.Literal("refused"),
});

export const ReviewPrivacyDecisionSchema = Schema.Union([
  ReviewAllowedPrivacyDecisionSchema,
  ReviewRefusedPrivacyDecisionSchema,
]);

export type ReviewPrivacyMode = typeof ReviewPrivacyModeSchema.Type;
export type ReviewTransport = typeof ReviewTransportSchema.Type;
export type ReviewAllowedPrivacyDecision =
  typeof ReviewAllowedPrivacyDecisionSchema.Type;
export type ReviewPrivacyDecision = typeof ReviewPrivacyDecisionSchema.Type;

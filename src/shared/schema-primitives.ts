import * as Schema from "effect/Schema";

export const NonEmptyStringSchema = Schema.String.check(
  Schema.isMinLength(1, { message: "must not be empty" }),
);

export const PositiveIntegerSchema = Schema.Int.check(
  Schema.isGreaterThan(0, { message: "must be greater than 0" }),
);

export const NonNegativeIntegerSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0, { message: "must not be negative" }),
);

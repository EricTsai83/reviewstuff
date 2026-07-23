import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  decodeConfigContents,
  reviewPresets,
  resolveReviewConfig,
} from "../../src/config/config-service";
import { ReviewstuffConfigJsonSchema } from "../../src/config/schema";

const decodeConfig = (contents: string) =>
  Schema.decodeUnknownEffect(ReviewstuffConfigJsonSchema)(contents, {
    onExcessProperty: "error",
  }).pipe(Effect.runPromise);

describe("config schema", () => {
  test("decodes the versioned config shape", async () => {
    expect(
      await decodeConfig(
        JSON.stringify({
          schemaVersion: 1,
          review: {
            preset: "standard",
            engine: "fake",
            provider: "fake",
            model: "fake-reviewer-v1",
            timeoutMs: 120_000,
            concurrency: 2,
            requestBudget: {
              maxTokens: 128_000,
              fixedRequestOverheadTokens: 2_048,
              outputReserveTokens: 16_384,
            },
          },
        }),
      ),
    ).toEqual({
      schemaVersion: 1,
      review: {
        preset: "standard",
        engine: "fake",
        provider: "fake",
        model: "fake-reviewer-v1",
        timeoutMs: 120_000,
        concurrency: 2,
        requestBudget: {
          maxTokens: 128_000,
          fixedRequestOverheadTokens: 2_048,
          outputReserveTokens: 16_384,
        },
      },
    });
  });

  test.each([
    [{ schemaVersion: 2 }, "unsupported schema version"],
    [
      { schemaVersion: 1, review: { preset: "thorough" } },
      "unsupported preset",
    ],
    [
      { schemaVersion: 1, review: { timeoutMs: 0 } },
      "non-positive timeout",
    ],
    [
      { schemaVersion: 1, review: { concurrency: 1.5 } },
      "non-integer concurrency",
    ],
    [
      {
        schemaVersion: 1,
        review: {
          requestBudget: {
            maxTokens: 128_000,
            fixedRequestOverheadTokens: -1,
            outputReserveTokens: 16_384,
          },
        },
      },
      "negative request budget overhead",
    ],
    [{ schemaVersion: 1, unknown: true }, "unknown property"],
  ])("rejects %s (%s)", async (input) => {
    expect(decodeConfig(JSON.stringify(input))).rejects.toBeDefined();
  });

  test("config service errors never retain rejected secret values", async () => {
    const secret = "sk-secret-value";
    const error = await decodeConfigContents(JSON.stringify({
      schemaVersion: 1,
      review: { apiKey: secret },
    })).pipe(Effect.flip, Effect.runPromise);

    expect(Schema.isSchemaError(error.cause)).toBe(true);
    expect(JSON.stringify(error)).not.toContain(secret);
  });
});

describe("review config resolution", () => {
  test("uses the standard preset when no config exists", () => {
    expect(resolveReviewConfig(undefined)).toEqual({
      ...reviewPresets.standard,
      preset: "standard",
    });
  });

  test("quick and standard presets have distinct execution budgets", () => {
    expect(reviewPresets.quick.timeoutMs).toBeLessThan(
      reviewPresets.standard.timeoutMs,
    );
    expect(reviewPresets.quick.concurrency).toBeLessThan(
      reviewPresets.standard.concurrency,
    );
  });

  test("resolves preset defaults, config values, then CLI overrides", () => {
    expect(
      resolveReviewConfig(
        {
          schemaVersion: 1,
          review: {
            preset: "quick",
            engine: "config-engine",
            provider: "config-provider",
            model: "config-model",
            timeoutMs: 45_000,
            concurrency: 3,
          },
        },
        {
          preset: "standard",
          engine: "cli-engine",
          model: "cli-model",
        },
      ),
    ).toEqual({
      preset: "standard",
      engine: "cli-engine",
      provider: "config-provider",
      model: "cli-model",
      timeoutMs: 45_000,
      concurrency: 3,
      requestBudget: reviewPresets.standard.requestBudget,
    });
  });
});

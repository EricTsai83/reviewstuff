import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import {
  ConfigFileDecodeError,
  ConfigFileReadError,
  make,
  reviewPresets,
  resolveReviewConfig,
} from "../../src/config/config-service";
import { ReviewstuffConfigJsonSchema } from "../../src/config/schema";

const loadConfigWith = (
  readFileString: FileSystem.FileSystem["readFileString"],
) =>
  Effect.gen(function* () {
    const configService = yield* make.pipe(
      Effect.provideService(
        FileSystem.FileSystem,
        FileSystem.makeNoop({ readFileString }),
      ),
    );

    return yield* configService.load();
  });

const fileSystemError = (
  tag: PlatformError.SystemErrorTag,
): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: tag,
    module: "FileSystem",
    method: "readFileString",
    pathOrDescriptor: "reviewstuff.config.json",
  });

const decodeConfig = (contents: string) =>
  Schema.decodeUnknownEffect(ReviewstuffConfigJsonSchema)(contents, {
    onExcessProperty: "error",
  }).pipe(Effect.runPromise);

describe("config schema", () => {
  test("accepts an empty config", async () => {
    expect(await decodeConfig("{}")).toEqual({});
  });

  test("decodes the user-authored config shape", async () => {
    expect(
      await decodeConfig(
        JSON.stringify({
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
    [{ schemaVersion: 1 }, "obsolete schema version property"],
    [{ review: { preset: "thorough" } }, "unsupported preset"],
    [{ review: { timeoutMs: 0 } }, "non-positive timeout"],
    [{ review: { concurrency: 1.5 } }, "non-integer concurrency"],
    [
      {
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
    [{ unknown: true }, "unknown property"],
  ])("rejects %s (%s)", async (input) => {
    expect(decodeConfig(JSON.stringify(input))).rejects.toBeDefined();
  });
});

describe("review config resolution", () => {
  test("uses defaults when the config file is empty", async () => {
    const config = await loadConfigWith(() => Effect.succeed("{}")).pipe(
      Effect.runPromise,
    );

    expect(config).toEqual({
      ...reviewPresets.standard,
      preset: "standard",
    });
  });

  test("uses defaults when the config file does not exist", async () => {
    const config = await loadConfigWith(() =>
      Effect.fail(fileSystemError("NotFound"))
    ).pipe(Effect.runPromise);

    expect(config).toEqual({
      ...reviewPresets.standard,
      preset: "standard",
    });
  });

  test("maps config file read failures precisely", async () => {
    const cause = fileSystemError("PermissionDenied");
    const error = await loadConfigWith(() => Effect.fail(cause)).pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toEqual(
      new ConfigFileReadError({
        path: "reviewstuff.config.json",
        cause,
      }),
    );
  });

  test("maps invalid config contents to a decode failure", async () => {
    const error = await loadConfigWith(() =>
      Effect.succeed('{"review":{"timeoutMs":0}}')
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(ConfigFileDecodeError);
    expect(error.path).toBe("reviewstuff.config.json");
  });

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

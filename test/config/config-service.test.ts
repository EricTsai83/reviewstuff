import * as BunServices from "@effect/platform-bun/BunServices";
import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import {
  ConfigFileParseError,
  ConfigFileReadError,
  ConfigFileSchemaError,
  make,
  reviewPresets,
  resolveReviewConfig,
} from "../../src/config/config-service";

const pathService = Path.Path.pipe(
  Effect.provide(BunServices.layer),
  Effect.runSync,
);
const repository = { root: "/repo" };
const configPath = "/repo/.reviewstuff.yaml";

const loadConfigWith = (
  readFileString: FileSystem.FileSystem["readFileString"],
) =>
  Effect.gen(function* () {
    const configService = yield* make.pipe(
      Effect.provideService(
        FileSystem.FileSystem,
        FileSystem.makeNoop({ readFileString }),
      ),
      Effect.provideService(Path.Path, pathService),
    );

    return yield* configService.load(repository);
  });

const fileSystemError = (
  tag: PlatformError.SystemErrorTag,
): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: tag,
    module: "FileSystem",
    method: "readFileString",
    pathOrDescriptor: configPath,
  });

describe("review config loading", () => {
  test("reads .reviewstuff.yaml from the selected repository root", async () => {
    let receivedPath: string | undefined;

    await loadConfigWith((path) => {
      receivedPath = path.toString();
      return Effect.succeed("");
    }).pipe(Effect.runPromise);

    expect(receivedPath).toBe(configPath);
  });

  test.each([
    ["", "blank"],
    ["# repository defaults\n", "comment-only"],
    ["---\n", "document marker only"],
    ["---\n# repository defaults\n", "document marker and comments"],
  ])("uses defaults for blank or comment-only config", async (contents) => {
    const config = await loadConfigWith(() => Effect.succeed(contents)).pipe(
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

  test("loads and resolves the supported YAML config", async () => {
    const config = await loadConfigWith(() =>
      Effect.succeed(`
review:
  preset: quick
  privacy: cloud-allowed
  engine: fake
  provider: fake
  model: fake-reviewer-v1
  timeoutMs: 45000
  concurrency: 3
  requestBudget:
    maxTokens: 64000
    fixedRequestOverheadTokens: 1024
    outputReserveTokens: 8192
`)
    ).pipe(Effect.runPromise);

    expect(config).toEqual({
      preset: "quick",
      privacy: "cloud-allowed",
      engine: "fake",
      provider: "fake",
      model: "fake-reviewer-v1",
      timeoutMs: 45_000,
      concurrency: 3,
      requestBudget: {
        maxTokens: 64_000,
        fixedRequestOverheadTokens: 1_024,
        outputReserveTokens: 8_192,
      },
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
        path: configPath,
        cause,
      }),
    );
  });

  test("maps invalid YAML to a parse failure with a safe location", async () => {
    const error = await loadConfigWith(() =>
      Effect.succeed("review: [\n  secret-value")
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(ConfigFileParseError);
    if (!(error instanceof ConfigFileParseError)) {
      throw new Error("expected ConfigFileParseError");
    }
    expect(error.path).toBe(configPath);
    expect(error.failure).toBe("syntax");
    expect(error.line).toBeGreaterThan(0);
    expect(error.column).toBeGreaterThan(0);
  });

  test.each([
    ["null\n", [], "explicit null root"],
    ["standard\n", [], "scalar root"],
    ["- review\n", [], "sequence root"],
    ["unknown: true\n", [], "unknown root field"],
    ["review:\n  apiKey: secret\n", ["review"], "unknown review field"],
    [
      "review:\n  preset: thorough\n",
      ["review", "preset"],
      "unsupported preset",
    ],
    [
      "review:\n  privacy: implicit\n",
      ["review", "privacy"],
      "unsupported privacy mode",
    ],
    [
      "review:\n  timeoutMs: 0\n",
      ["review", "timeoutMs"],
      "non-positive timeout",
    ],
    [
      "review:\n  concurrency: 1.5\n",
      ["review", "concurrency"],
      "non-integer concurrency",
    ],
    [
      [
        "review:",
        "  requestBudget:",
        "    maxTokens: 128000",
        "    fixedRequestOverheadTokens: -1",
        "    outputReserveTokens: 16384",
        "",
      ].join("\n"),
      ["review", "requestBudget", "fixedRequestOverheadTokens"],
      "negative request budget overhead",
    ],
  ])(
    "maps invalid typed config to a schema failure",
    async (contents, expectedPath) => {
      const error = await loadConfigWith(() =>
        Effect.succeed(contents as string)
      ).pipe(Effect.flip, Effect.runPromise);

      expect(error).toBeInstanceOf(ConfigFileSchemaError);
      if (!(error instanceof ConfigFileSchemaError)) {
        throw new Error("expected ConfigFileSchemaError");
      }
      expect(error.path).toBe(configPath);
      expect(error.fieldPath).toEqual(expectedPath);
      expect(error.constraint.length).toBeGreaterThan(0);
    },
  );

  test("schema error metadata never includes a rejected literal", async () => {
    const rejectedValue = "sk-secret-preset";
    const error = await loadConfigWith(() =>
      Effect.succeed(`review:\n  preset: ${rejectedValue}\n`)
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(ConfigFileSchemaError);
    if (!(error instanceof ConfigFileSchemaError)) {
      throw new Error("expected ConfigFileSchemaError");
    }
    expect(error.fieldPath).toEqual(["review", "preset"]);
    expect(error.constraint).toBe("Expected quick or standard.");
    expect(error.constraint).not.toContain(rejectedValue);
  });

  test("reports a missing request-budget key as required", async () => {
    const error = await loadConfigWith(() =>
      Effect.succeed("review:\n  requestBudget:\n    maxTokens: 100\n")
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error).toBeInstanceOf(ConfigFileSchemaError);
    if (!(error instanceof ConfigFileSchemaError)) {
      throw new Error("expected ConfigFileSchemaError");
    }
    expect(error.fieldPath).toEqual([
      "review",
      "requestBudget",
      "fixedRequestOverheadTokens",
    ]);
    expect(error.constraint).toBe("This field is required.");
  });
});

describe("review config resolution", () => {
  test("uses the standard preset when no config exists", () => {
    expect(resolveReviewConfig(undefined)).toEqual({
      ...reviewPresets.standard,
      preset: "standard",
    });
    expect(resolveReviewConfig(undefined).privacy).toBe("local-only");
  });

  test("quick and standard presets have distinct execution budgets", () => {
    expect(reviewPresets.quick.privacy).toBe("local-only");
    expect(reviewPresets.standard.privacy).toBe("local-only");
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
            privacy: "cloud-allowed",
            engine: "config-engine",
            provider: "config-provider",
            model: "config-model",
            timeoutMs: 45_000,
            concurrency: 3,
          },
        },
        {
          preset: "standard",
          privacy: "local-only",
          engine: "cli-engine",
          model: "cli-model",
        },
      ),
    ).toEqual({
      preset: "standard",
      privacy: "local-only",
      engine: "cli-engine",
      provider: "config-provider",
      model: "cli-model",
      timeoutMs: 45_000,
      concurrency: 3,
      requestBudget: reviewPresets.standard.requestBudget,
    });
  });
});

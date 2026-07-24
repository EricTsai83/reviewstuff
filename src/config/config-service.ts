import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  type ReviewPresetName,
  type ReviewRequestBudgetConfig,
  type ReviewstuffConfigV1,
  ReviewstuffConfigJsonSchema,
  reviewConfigFileName,
} from "./schema";

export interface ResolvedReviewConfig {
  readonly preset: ReviewPresetName;
  readonly engine: string;
  readonly provider: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly requestBudget: ReviewRequestBudgetConfig;
}

export interface ReviewConfigOverrides {
  readonly preset?: ReviewPresetName;
  readonly engine?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly requestBudget?: ReviewRequestBudgetConfig;
}

export type ReviewPresetConfig = Omit<ResolvedReviewConfig, "preset">;

export const reviewPresets: Readonly<
  Record<ReviewPresetName, ReviewPresetConfig>
> = {
  quick: {
    engine: "fake",
    provider: "fake",
    model: "fake-reviewer-v1",
    timeoutMs: 30_000,
    concurrency: 1,
    requestBudget: {
      maxTokens: 128_000,
      fixedRequestOverheadTokens: 2_048,
      outputReserveTokens: 16_384,
    },
  },
  standard: {
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
};

export class ConfigFileReadError extends Data.TaggedError(
  "ConfigFileReadError",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class ConfigFileDecodeError extends Data.TaggedError(
  "ConfigFileDecodeError",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export type ConfigError = ConfigFileReadError | ConfigFileDecodeError;

export class ConfigService extends Context.Service<
  ConfigService,
  {
    readonly load: (
      overrides?: ReviewConfigOverrides,
    ) => Effect.Effect<ResolvedReviewConfig, ConfigError>;
  }
>()("reviewstuff/ConfigService") {}

export const resolveReviewConfig = (
  config: ReviewstuffConfigV1 | undefined,
  overrides: ReviewConfigOverrides = {},
): ResolvedReviewConfig => {
  const configured = config?.review;
  const preset = overrides.preset ?? configured?.preset ?? "standard";

  return {
    ...reviewPresets[preset],
    ...configured,
    ...overrides,
    preset,
  };
};

const decodeConfigContents = (
  contents: string,
): Effect.Effect<ReviewstuffConfigV1, ConfigFileDecodeError> =>
  Schema.decodeUnknownEffect(ReviewstuffConfigJsonSchema)(contents, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      (cause) =>
        new ConfigFileDecodeError({
          path: reviewConfigFileName,
          cause,
        }),
    ),
  );

const loadConfig = (
  fileSystem: FileSystem.FileSystem,
): Effect.Effect<Option.Option<ReviewstuffConfigV1>, ConfigError> =>
  fileSystem.readFileString(reviewConfigFileName).pipe(
    Effect.map(Option.some),
    Effect.catchTags({
      PlatformError: (cause) => {
        if (cause.reason._tag === "NotFound") {
          return Effect.succeed(Option.none<string>());
        }

        return Effect.fail(
          new ConfigFileReadError({ path: reviewConfigFileName, cause }),
        );
      },
    }),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(Option.none<ReviewstuffConfigV1>()),
        onSome: (contents) =>
          decodeConfigContents(contents).pipe(Effect.map(Option.some)),
      }),
    ),
  );

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;

  return ConfigService.of({
    load: (overrides) =>
      loadConfig(fileSystem).pipe(
        Effect.map((config) =>
          resolveReviewConfig(Option.getOrUndefined(config), overrides)
        ),
      ),
  });
});

export const layer: Layer.Layer<ConfigService, never, FileSystem.FileSystem> =
  Layer.effect(ConfigService, make);

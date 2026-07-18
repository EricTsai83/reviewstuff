import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import {
  type ReviewConfig,
  type ReviewProfile,
  type ReviewRequestBudgetConfig,
  type ReviewstuffConfigV1,
  ReviewstuffConfigJsonSchema,
  reviewConfigFileName,
} from "./schema";

export interface ResolvedReviewConfig {
  readonly profile: ReviewProfile;
  readonly engine: string;
  readonly provider: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly requestBudget: ReviewRequestBudgetConfig;
}

export type ReviewConfigOverrides = Partial<ResolvedReviewConfig>;

export const profiles: Readonly<Record<ReviewProfile, ResolvedReviewConfig>> = {
  quick: {
    profile: "quick",
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
    profile: "standard",
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

const configFileInvalidCauses = new WeakMap<object, unknown>();

export class ConfigFileInvalidError extends Data.TaggedError(
  "ConfigFileInvalidError",
)<{
  readonly path: string;
}> {
  constructor(args: { readonly path: string; readonly cause: unknown }) {
    super({ path: args.path });
    configFileInvalidCauses.set(this, args.cause);
  }

  override get cause(): unknown {
    return configFileInvalidCauses.get(this);
  }
}

export class UnsupportedReviewSelectionError extends Data.TaggedError(
  "UnsupportedReviewSelectionError",
)<{
  readonly engine: string;
  readonly provider: string;
  readonly model: string;
}> {}

export type ConfigError =
  | ConfigFileReadError
  | ConfigFileInvalidError
  | UnsupportedReviewSelectionError;

export const resolveReviewConfig = (
  config: ReviewstuffConfigV1 | undefined,
  overrides: ReviewConfigOverrides = {},
): ResolvedReviewConfig => {
  const configured = config?.review;
  const profile = overrides.profile ?? configured?.profile ?? "standard";

  return {
    ...profiles[profile],
    ...configured,
    ...overrides,
    profile,
  };
};

export class ConfigService extends Context.Service<
  ConfigService,
  {
    readonly load: (
      overrides?: ReviewConfigOverrides,
    ) => Effect.Effect<ResolvedReviewConfig, ConfigError>;
  }
>()("reviewstuff/ConfigService") {}

export const decodeConfigContents = (
  contents: string,
): Effect.Effect<ReviewstuffConfigV1, ConfigFileInvalidError> =>
  Schema.decodeUnknownEffect(ReviewstuffConfigJsonSchema)(contents, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      (cause) =>
        new ConfigFileInvalidError({
          path: reviewConfigFileName,
          cause,
        }),
    ),
  );

const loadConfig = (
  fileSystem: FileSystem.FileSystem,
): Effect.Effect<ReviewstuffConfigV1 | undefined, ConfigError> =>
  fileSystem.exists(reviewConfigFileName).pipe(
    Effect.mapError(
      (cause) =>
        new ConfigFileReadError({ path: reviewConfigFileName, cause }),
    ),
    Effect.flatMap((exists) => {
      if (!exists) {
        return Effect.succeed<undefined>(undefined);
      }

      return fileSystem.readFileString(reviewConfigFileName).pipe(
        Effect.mapError(
          (cause) =>
            new ConfigFileReadError({ path: reviewConfigFileName, cause }),
        ),
        Effect.flatMap(decodeConfigContents),
      );
    }),
  );

export const layer: Layer.Layer<ConfigService, never, FileSystem.FileSystem> =
  Layer.effect(
    ConfigService,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;

      return {
        load: (overrides) =>
          loadConfig(fileSystem).pipe(
            Effect.map((config) => resolveReviewConfig(config, overrides)),
          ),
      };
    }),
  );

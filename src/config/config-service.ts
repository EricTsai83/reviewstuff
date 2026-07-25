import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import type { RepositoryContext } from "../domain/repository";
import type { ReviewPrivacyMode } from "../domain/privacy";
import {
  type ReviewRequestBudgetConfig,
  type ReviewWorkload,
  reviewWorkloadPresets,
} from "../domain/workload";
import {
  type ReviewstuffConfig,
  ReviewstuffConfigSchema,
  reviewConfigFileName,
} from "./schema";
import {
  parseYamlConfig,
  YamlConfigParseError,
  type YamlConfigParseFailure,
} from "./yaml-parser";

export interface ResolvedReviewConfig {
  readonly workload: ReviewWorkload;
  readonly privacy: ReviewPrivacyMode;
  readonly engine?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly requestBudget: ReviewRequestBudgetConfig;
}

export interface ReviewConfigOverrides {
  readonly workload?: ReviewWorkload;
  readonly privacy?: ReviewPrivacyMode;
  readonly engine?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly requestBudget?: ReviewRequestBudgetConfig;
}

export class ConfigFileReadError extends Data.TaggedError(
  "ConfigFileReadError",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class ConfigFileParseError extends Data.TaggedError(
  "ConfigFileParseError",
)<{
  readonly path: string;
  readonly failure: YamlConfigParseFailure;
  readonly line: number;
  readonly column: number;
  readonly cause: unknown;
}> {}

export class ConfigFileSchemaError extends Data.TaggedError(
  "ConfigFileSchemaError",
)<{
  readonly path: string;
  readonly fieldPath: ReadonlyArray<string>;
  readonly constraint: string;
  readonly cause: unknown;
}> {}

export type ConfigError =
  | ConfigFileReadError
  | ConfigFileParseError
  | ConfigFileSchemaError;

export class ConfigService extends Context.Service<
  ConfigService,
  {
    readonly load: (
      repository: RepositoryContext,
      overrides?: ReviewConfigOverrides,
    ) => Effect.Effect<ResolvedReviewConfig, ConfigError>;
  }
>()("reviewstuff/ConfigService") {}

export const resolveReviewConfig = (
  config: ReviewstuffConfig | undefined,
  overrides: ReviewConfigOverrides = {},
): ResolvedReviewConfig => {
  const configured = config?.review;
  const workload = overrides.workload ?? configured?.workload ?? "standard";

  return {
    privacy: "local-only",
    timeoutMs: 120_000,
    concurrency: 2,
    requestBudget: reviewWorkloadPresets[workload].requestBudget,
    ...configured,
    ...overrides,
    workload,
  };
};

const configFieldChildren: Readonly<Record<string, ReadonlySet<string>>> = {
  "": new Set(["review"]),
  review: new Set([
    "concurrency",
    "engine",
    "model",
    "privacy",
    "provider",
    "requestBudget",
    "timeoutMs",
    "workload",
  ]),
  "review.requestBudget": new Set([
    "fixedRequestOverheadTokens",
    "maxTokens",
    "outputReserveTokens",
  ]),
};

const configFieldConstraints: Readonly<Record<string, string>> = {
  "": "Expected a mapping with optional review settings.",
  review: "Expected a mapping of supported review settings.",
  "review.concurrency": "Expected a positive integer.",
  "review.engine": "Expected a non-empty string.",
  "review.model": "Expected a non-empty string.",
  "review.privacy": "Expected local-only or cloud-allowed.",
  "review.provider": "Expected a non-empty string.",
  "review.requestBudget": "Expected a complete request-budget mapping.",
  "review.requestBudget.fixedRequestOverheadTokens":
    "Expected a non-negative integer.",
  "review.requestBudget.maxTokens": "Expected a positive integer.",
  "review.requestBudget.outputReserveTokens": "Expected a non-negative integer.",
  "review.timeoutMs": "Expected a positive integer.",
  "review.workload": "Expected standard or light.",
};

interface SchemaIssueLocation {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly tag: SchemaIssue.Issue["_tag"];
}

const locateFirstSchemaIssue = (
  issue: SchemaIssue.Issue,
  path: ReadonlyArray<PropertyKey> = [],
): SchemaIssueLocation => {
  switch (issue._tag) {
    case "Composite":
      return locateFirstSchemaIssue(issue.issues[0], path);
    case "AnyOf":
      return issue.issues[0] === undefined
        ? { path, tag: issue._tag }
        : locateFirstSchemaIssue(issue.issues[0], path);
    case "Encoding":
    case "Filter":
      return locateFirstSchemaIssue(issue.issue, path);
    case "Pointer":
      return locateFirstSchemaIssue(issue.issue, [...path, ...issue.path]);
    case "Forbidden":
    case "InvalidType":
    case "InvalidValue":
    case "MissingKey":
    case "OneOf":
    case "UnexpectedKey":
      return { path, tag: issue._tag };
  }
};

const sanitizeConfigFieldPath = (
  path: ReadonlyArray<PropertyKey>,
): ReadonlyArray<string> => {
  const output: Array<string> = [];

  for (const key of path) {
    const parent = output.join(".");
    if (
      typeof key !== "string" ||
      configFieldChildren[parent]?.has(key) !== true
    ) {
      break;
    }
    output.push(key);
  }

  return output;
};

const safeConfigConstraint = (
  issueTag: SchemaIssue.Issue["_tag"],
  rawFieldPath: ReadonlyArray<PropertyKey>,
  fieldPath: ReadonlyArray<string>,
): string =>
  issueTag === "MissingKey"
    ? "This field is required."
    : rawFieldPath.length > fieldPath.length
    ? "The object contains an unsupported field."
    : configFieldConstraints[fieldPath.join(".")] ??
      "The configuration does not match the supported schema.";

const decodeConfigContents = (
  contents: string,
  configPath: string,
): Effect.Effect<
  ReviewstuffConfig,
  ConfigFileParseError | ConfigFileSchemaError
> =>
  Effect.try({
    try: () => parseYamlConfig(contents),
    catch: (cause) =>
      cause instanceof YamlConfigParseError
        ? new ConfigFileParseError({
          path: configPath,
          failure: cause.failure,
          line: cause.line,
          column: cause.column,
          cause: cause.cause,
        })
        : new ConfigFileParseError({
          path: configPath,
          failure: "syntax",
          line: 1,
          column: 1,
          cause,
        }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ReviewstuffConfigSchema, {
      onExcessProperty: "error",
    })),
    Effect.mapError(
      (cause) => {
        if (cause instanceof ConfigFileParseError) {
          return cause;
        }
        const location = locateFirstSchemaIssue(cause.issue);
        const fieldPath = sanitizeConfigFieldPath(location.path);

        return new ConfigFileSchemaError({
          path: configPath,
          fieldPath,
          constraint: safeConfigConstraint(
            location.tag,
            location.path,
            fieldPath,
          ),
          cause,
        });
      },
    ),
  );

const loadConfig = (
  fileSystem: FileSystem.FileSystem,
  configPath: string,
): Effect.Effect<Option.Option<ReviewstuffConfig>, ConfigError> =>
  fileSystem.readFileString(configPath).pipe(
    Effect.map(Option.some),
    Effect.catchTags({
      PlatformError: (cause) => {
        if (cause.reason._tag === "NotFound") {
          return Effect.succeed(Option.none<string>());
        }

        return Effect.fail(
          new ConfigFileReadError({ path: configPath, cause }),
        );
      },
    }),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(Option.none<ReviewstuffConfig>()),
        onSome: (contents) =>
          decodeConfigContents(contents, configPath).pipe(
            Effect.map(Option.some),
          ),
      }),
    ),
  );

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return ConfigService.of({
    load: (repository, overrides) =>
      loadConfig(
        fileSystem,
        path.join(repository.root, reviewConfigFileName),
      ).pipe(
        Effect.map((config) =>
          resolveReviewConfig(Option.getOrUndefined(config), overrides)
        ),
      ),
  });
});

export const layer: Layer.Layer<
  ConfigService,
  never,
  FileSystem.FileSystem | Path.Path
> =
  Layer.effect(ConfigService, make);

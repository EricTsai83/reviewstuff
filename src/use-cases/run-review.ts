import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import {
  type ConfigError,
  ConfigService,
  type ReviewConfigOverrides,
  type ResolvedReviewConfig,
} from "../config/config-service";
import type { ReviewFindingV1 } from "../domain/finding";
import {
  type ReviewAllowedPrivacyDecision,
  type ReviewPrivacyDecision,
  type ReviewPrivacyMode,
  type ReviewTransport,
} from "../domain/privacy";
import {
  compareReviewFileIdentity,
  type ReviewFileCoverage,
} from "../domain/review-file";
import {
  decodeReviewReportV5,
  type ReviewReportV5,
} from "../domain/report";
import type { ReviewScope } from "../domain/scope";
import {
  type ReviewEngineError,
  ReviewEngine,
} from "../engines/review-engine";
import {
  type GitError,
  type GitDiff,
  type GitTextFile,
  GitService,
} from "../git/git-service";
import {
  fallbackReviewRequestEstimator,
  type ReviewBudgetPolicy,
  type ReviewSelectionV1,
  selectReviewHunks,
} from "../review/review-budget";
import { redactReviewRequestV1 } from "../review/review-redaction";
import {
  buildReviewRequestV1,
  type ReviewRequestV1,
} from "../review/review-request";

export type { ReviewConfigOverrides } from "../config/config-service";

export class ReviewTimeoutError extends Data.TaggedError(
  "ReviewTimeoutError",
)<{
  readonly timeoutMilliseconds: number;
}> {}

export class ReviewSelectionUnsupportedError extends Data.TaggedError(
  "ReviewSelectionUnsupportedError",
)<{
  readonly engine: string;
  readonly provider: string;
  readonly model: string;
}> {}

export class ReviewCloudPrivacyError extends Data.TaggedError(
  "ReviewCloudPrivacyError",
)<{
  readonly mode: "local-only";
  readonly transport: "cloud";
}> {}

export type RunReviewError =
  | GitError
  | ConfigError
  | ReviewSelectionUnsupportedError
  | ReviewCloudPrivacyError
  | ReviewEngineError
  | ReviewTimeoutError;

export interface RunReviewInput {
  readonly scope: ReviewScope;
  readonly repositoryPath?: string;
  readonly configOverrides?: ReviewConfigOverrides;
}

export type PreviewReviewRequestResult = ReviewRequestV1;

const ensureSupportedFakeSelection = (
  config: ResolvedReviewConfig,
): Effect.Effect<void, ReviewSelectionUnsupportedError> =>
  config.engine === "fake" &&
    config.provider === "fake" &&
    config.model === "fake-reviewer-v1"
    ? Effect.void
    : Effect.fail(
        new ReviewSelectionUnsupportedError({
          engine: config.engine,
          provider: config.provider,
          model: config.model,
        }),
      );

export const decideReviewPrivacy = (
  mode: ReviewPrivacyMode,
  transport: ReviewTransport,
): ReviewPrivacyDecision => {
  if (mode === "local-only") {
    return transport === "local"
      ? { mode, transport, decision: "allowed" }
      : { mode, transport, decision: "refused" };
  }

  return { mode, transport, decision: "allowed" };
};

const enforceReviewPrivacy = (
  decision: ReviewPrivacyDecision,
): Effect.Effect<ReviewAllowedPrivacyDecision, ReviewCloudPrivacyError> =>
  decision.decision === "allowed"
    ? Effect.succeed(decision)
    : Effect.fail(
        new ReviewCloudPrivacyError({
          mode: decision.mode,
          transport: decision.transport,
        }),
      );

const textFiles = (diff: GitDiff): ReadonlyArray<GitTextFile> =>
  diff.files.filter((file): file is GitTextFile => file.kind === "text");

const buildCoverageFiles = (
  diff: GitDiff,
  selection: ReviewSelectionV1,
): ReadonlyArray<ReviewFileCoverage> => {
  const binaryCoverage = diff.files.flatMap((file) =>
    file.kind === "binary"
      ? [{
        path: file.path,
        source: file.source,
        status: "skipped" as const,
        reason: "binary" as const,
      }]
      : []
  );

  return [...selection.coverage.files, ...binaryCoverage].sort(
    compareReviewFileIdentity,
  );
};

const requestEnvelopeTokens = (
  scope: ReviewScope,
  config: ResolvedReviewConfig,
): number => {
  const emptyRequest = buildReviewRequestV1({
    repository: { scope },
    config: { model: config.model },
    files: [],
  });
  const emptyRequestTokens = fallbackReviewRequestEstimator.estimate(
    JSON.stringify(emptyRequest),
  );
  const emptyFilesTokens = fallbackReviewRequestEstimator.estimate(
    JSON.stringify([]),
  );

  return emptyRequestTokens - emptyFilesTokens;
};

const effectiveBudgetPolicy = (
  scope: ReviewScope,
  config: ResolvedReviewConfig,
): ReviewBudgetPolicy => ({
  ...config.requestBudget,
  fixedRequestOverheadTokens: Math.max(
    config.requestBudget.fixedRequestOverheadTokens,
    requestEnvelopeTokens(scope, config),
  ),
});

const buildReviewReport = (
  scope: ReviewScope,
  diff: GitDiff,
  selection: ReviewSelectionV1,
  findings: ReadonlyArray<ReviewFindingV1>,
  privacy: ReviewAllowedPrivacyDecision,
): ReviewReportV5 => {
  const coverageFiles = buildCoverageFiles(diff, selection);
  const reviewedFiles = coverageFiles.filter((file) =>
    file.status === "reviewed"
  ).length;
  const truncatedFiles = coverageFiles.filter((file) =>
    file.status === "truncated"
  ).length;
  const skippedFiles = coverageFiles.filter((file) =>
    file.status === "skipped"
  ).length;

  return decodeReviewReportV5({
    schemaVersion: 5,
    scope,
    privacy,
    summary: {
      changedFiles: coverageFiles.length,
      reviewedFiles,
      truncatedFiles,
      skippedFiles,
      findings: findings.length,
    },
    coverage: {
      schemaVersion: 2,
      complete: truncatedFiles === 0 && skippedFiles === 0,
      files: coverageFiles,
    },
    budget: selection.estimate,
    findings,
  });
};

interface PreparedReview {
  readonly config: ResolvedReviewConfig;
  readonly diff: GitDiff;
  readonly engine: ReviewEngine["Service"];
  readonly privacy: ReviewAllowedPrivacyDecision;
  readonly request: ReviewRequestV1;
  readonly selection: ReviewSelectionV1;
}

const withPreparedReview = <Success, Error>(
  {
    scope,
    repositoryPath,
    configOverrides = {},
  }: RunReviewInput,
  effect: (
    prepared: PreparedReview,
  ) => Effect.Effect<Success, Error>,
): Effect.Effect<
  Success,
  RunReviewError | Error,
  GitService | ConfigService | ReviewEngine
> =>
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const git = yield* GitService;
    const engine = yield* ReviewEngine;
    const repository = yield* git.resolveRepository(repositoryPath);
    const config = yield* configService.load(repository, configOverrides);
    const privacy = yield* enforceReviewPrivacy(
      decideReviewPrivacy(config.privacy, engine.transport),
    );
    yield* ensureSupportedFakeSelection(config);
    return yield* Effect.gen(function* () {
      const diff = yield* git.readDiff(repository, scope);
      const reviewableFiles = textFiles(diff);
      const selection = selectReviewHunks({
        files: reviewableFiles.map(({ path, source, fileHeader, hunks }) => ({
          path,
          source,
          fileHeader,
          hunks: hunks.map(({ patch }) => ({ patch })),
        })),
        policy: effectiveBudgetPolicy(scope, config),
      });
      const { request } = redactReviewRequestV1(
        buildReviewRequestV1({
          repository: { scope },
          config: { model: config.model },
          files: selection.files,
        }),
      );

      return yield* effect({
        config,
        diff,
        engine,
        privacy,
        request,
        selection,
      });
    }).pipe(
      Effect.timeoutOrElse({
        duration: config.timeoutMs,
        orElse: () =>
          Effect.fail(
            new ReviewTimeoutError({
              timeoutMilliseconds: config.timeoutMs,
            }),
          ),
      }),
    );
  });

export const previewReviewRequest = (
  input: RunReviewInput,
): Effect.Effect<
  PreviewReviewRequestResult,
  RunReviewError,
  GitService | ConfigService | ReviewEngine
> =>
  withPreparedReview(input, ({ request }) => Effect.succeed(request));

export const runReview = (
  input: RunReviewInput,
): Effect.Effect<
  ReviewReportV5,
  RunReviewError,
  GitService | ConfigService | ReviewEngine
> =>
  withPreparedReview(
    input,
    Effect.fn(function* ({
      config,
      diff,
      engine,
      privacy,
      request,
      selection,
    }) {
      const findings = selection.files.length > 0
        ? yield* engine.review(request, {
          concurrency: config.concurrency,
          timeoutMilliseconds: config.timeoutMs,
          maxOutputTokens: config.requestBudget.outputReserveTokens,
        })
        : [];

      return buildReviewReport(
        input.scope,
        diff,
        selection,
        findings,
        privacy,
      );
    }),
  );

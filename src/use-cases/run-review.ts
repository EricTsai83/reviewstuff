import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import {
  type ConfigError,
  ConfigService,
  type ReviewConfigOverrides,
  type ResolvedReviewConfig,
  UnsupportedReviewSelectionError,
} from "../config/config-service";
import type { ReviewFindingV1 } from "../domain/finding";
import {
  compareReviewFileIdentity,
  type ReviewFileCoverage,
} from "../domain/review-file";
import {
  decodeReviewReportV4,
  type ReviewReportV4,
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
import { buildReviewRequestV1 } from "../review/review-request";

export type { ReviewConfigOverrides } from "../config/config-service";

export class ReviewTimeoutError extends Data.TaggedError(
  "ReviewTimeoutError",
)<{
  readonly timeoutMilliseconds: number;
}> {}

export type RunReviewError =
  | GitError
  | ConfigError
  | ReviewEngineError
  | ReviewTimeoutError;

export interface RunReviewInput {
  readonly scope: ReviewScope;
  readonly configOverrides?: ReviewConfigOverrides;
}

const ensureSupportedFakeSelection = (
  config: ResolvedReviewConfig,
): Effect.Effect<void, UnsupportedReviewSelectionError> =>
  config.engine === "fake" &&
    config.provider === "fake" &&
    config.model === "fake-reviewer-v1"
    ? Effect.void
    : Effect.fail(
        new UnsupportedReviewSelectionError({
          engine: config.engine,
          provider: config.provider,
          model: config.model,
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
): ReviewReportV4 => {
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

  return decodeReviewReportV4({
    schemaVersion: 4,
    scope,
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

export const runReview = ({
  scope,
  configOverrides = {},
}: RunReviewInput): Effect.Effect<
  ReviewReportV4,
  RunReviewError,
  GitService | ConfigService | ReviewEngine
> =>
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const git = yield* GitService;
    const engine = yield* ReviewEngine;
    const config = yield* configService.load(configOverrides);
    yield* ensureSupportedFakeSelection(config);
    return yield* Effect.gen(function* () {
      const diff = yield* git.readDiff(scope);
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
      const request = buildReviewRequestV1({
        repository: { scope },
        config: { model: config.model },
        files: selection.files,
      });
      const findings = selection.files.length > 0
        ? yield* engine.review(request, { concurrency: config.concurrency })
        : [];
      return buildReviewReport(scope, diff, selection, findings);
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

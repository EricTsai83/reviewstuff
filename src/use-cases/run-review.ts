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
import type { ReviewFileCoverage } from "../domain/review-file";
import {
  decodeReviewReportV3,
  type ReviewReportV3,
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
import { buildReviewRequestV1 } from "../review/review-request";

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

const buildCoverageFiles = (
  diff: GitDiff,
): ReadonlyArray<ReviewFileCoverage> =>
  diff.files.map((file): ReviewFileCoverage =>
    file.kind === "text"
      ? {
          path: file.path,
          source: file.source,
          status: "reviewed",
        }
      : {
          path: file.path,
          source: file.source,
          status: "skipped",
          reason: "binary",
        }
  ).sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );

const textFiles = (diff: GitDiff): ReadonlyArray<GitTextFile> =>
  diff.files.filter((file): file is GitTextFile => file.kind === "text");

const buildReviewReport = (
  scope: ReviewScope,
  diff: GitDiff,
  findings: ReadonlyArray<ReviewFindingV1>,
): ReviewReportV3 => {
  const coverageFiles = buildCoverageFiles(diff);
  const reviewedFiles = textFiles(diff).length;
  const skippedFiles = diff.files.length - reviewedFiles;

  return decodeReviewReportV3({
    schemaVersion: 3,
    scope,
    summary: {
      changedFiles: coverageFiles.length,
      reviewedFiles,
      skippedFiles,
      findings: findings.length,
    },
    coverage: {
      schemaVersion: 1,
      complete: skippedFiles === 0,
      files: coverageFiles,
    },
    findings,
  });
};

export const runReview = (
  scope: ReviewScope,
  overrides: ReviewConfigOverrides = {},
): Effect.Effect<
  ReviewReportV3,
  RunReviewError,
  GitService | ConfigService | ReviewEngine
> =>
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const git = yield* GitService;
    const engine = yield* ReviewEngine;
    const config = yield* configService.load(overrides);
    yield* ensureSupportedFakeSelection(config);
    return yield* Effect.gen(function* () {
      const diff = yield* git.readDiff(scope);
      const reviewableFiles = textFiles(diff);
      const request = buildReviewRequestV1({
        repository: { scope },
        config: {
          profile: config.profile,
          model: config.model,
          concurrency: config.concurrency,
        },
        files: reviewableFiles.map(({ path, source, patch }) => ({
          path,
          source,
          patch,
        })),
      });
      const findings = yield* engine.review(request);
      return buildReviewReport(scope, diff, findings);
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

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import {
  type ConfigError,
  ConfigService,
  type ReviewConfigOverrides,
  type ResolvedReviewConfig,
  UnsupportedReviewSelectionError,
} from "../config/config-service";
import {
  decodeReviewFindingV1,
  type ReviewFindingV1,
} from "../domain/finding";
import type { ReviewFileCoverage } from "../domain/review-file";
import {
  decodeReviewReportV3,
  type ReviewReportV3,
} from "../domain/report";
import type { ReviewScope } from "../domain/scope";
import {
  type GitError,
  type GitDiff,
  type GitFilePatch,
  GitService,
} from "../git/git-service";

export class ReviewTimeoutError extends Data.TaggedError(
  "ReviewTimeoutError",
)<{
  readonly timeoutMilliseconds: number;
}> {}

export type RunReviewError = GitError | ConfigError | ReviewTimeoutError;

const fakeFindingMarker = "REVIEWSTUFF_FAKE_FINDING";

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

// Finding IDs are compatibility-sensitive deterministic identities. This is
// intentionally not a cryptographic hash and must never be used for security.
const stableFindingFingerprint = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const findingsForPatch = (
  file: GitFilePatch,
): ReadonlyArray<ReviewFindingV1> => {
  const findings: Array<ReviewFindingV1> = [];
  let targetLineNumber = 0;

  for (const line of file.patch.split("\n")) {
    const hunkHeaderMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(
      line,
    );

    if (hunkHeaderMatch !== null) {
      targetLineNumber = Number(hunkHeaderMatch[1]);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (line.includes(fakeFindingMarker)) {
        findings.push(decodeReviewFindingV1({
          id: `fake-marker:${file.path}:${targetLineNumber}:${stableFindingFingerprint(line.slice(1))}`,
          ruleId: "fake-marker",
          severity: "medium",
          category: "correctness",
          confidence: 1,
          message: "Deterministic fake finding marker detected.",
          file: file.path,
          line: targetLineNumber,
        }));
      }

      targetLineNumber += 1;
      continue;
    }

    if (!line.startsWith("-") && !line.startsWith("\\")) {
      targetLineNumber += 1;
    }
  }

  return findings;
};

const buildCoverageFiles = (
  diff: GitDiff,
): ReadonlyArray<ReviewFileCoverage> =>
  [
    ...diff.files.map((file) => ({
      path: file.path,
      source: file.source,
      status: "reviewed" as const,
    })),
    ...diff.skippedFiles.map((file) => ({
      ...file,
      status: "skipped" as const,
    })),
  ].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );

const buildReviewReport = (
  scope: ReviewScope,
  diff: GitDiff,
  findings: ReadonlyArray<ReviewFindingV1>,
): ReviewReportV3 => {
  const coverageFiles = buildCoverageFiles(diff);

  return decodeReviewReportV3({
    schemaVersion: 3,
    scope,
    summary: {
      changedFiles: coverageFiles.length,
      reviewedFiles: diff.files.length,
      skippedFiles: diff.skippedFiles.length,
      findings: findings.length,
    },
    coverage: {
      schemaVersion: 1,
      complete: diff.skippedFiles.length === 0,
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
  GitService | ConfigService
> =>
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const git = yield* GitService;
    const config = yield* configService.load(overrides);
    yield* ensureSupportedFakeSelection(config);
    return yield* Effect.gen(function* () {
      const diff = yield* git.readDiff(scope);
      const findings = yield* Effect.forEach(
        diff.files,
        (file) => Effect.sync(() => findingsForPatch(file)),
        { concurrency: config.concurrency },
      ).pipe(Effect.map((fileFindings) => fileFindings.flat()));
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

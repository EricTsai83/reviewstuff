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
  decodeReviewReportV7,
  type ReviewReportV7,
} from "../domain/report";
import type { ReviewScope } from "../domain/scope";
import {
  type ReviewEngineError,
} from "../engines/review-engine";
import {
  type ResolvedReviewEngine,
  type ReviewEngineRegistryError,
  ReviewEngineRegistry,
} from "../engines/review-engine-registry";
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
import type { ReviewRedactionSummaryV1 } from "../domain/redaction";
import {
  countReviewRedactions,
  redactReviewFileContents,
  redactReviewRequestV1,
} from "../review/review-redaction";
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

export class ReviewCloudPrivacyError extends Data.TaggedError(
  "ReviewCloudPrivacyError",
)<{
  readonly mode: "local-only";
  readonly transport: "cloud";
}> {}

export type RunReviewError =
  | GitError
  | ConfigError
  | ReviewEngineRegistryError
  | ReviewCloudPrivacyError
  | ReviewEngineError
  | ReviewTimeoutError;

export interface RunReviewInput {
  readonly scope: ReviewScope;
  readonly repositoryPath?: string;
  readonly configOverrides?: ReviewConfigOverrides;
}

export type PreviewReviewRequestResult = ReviewRequestV1;

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
  model: string,
): number => {
  const emptyRequest = buildReviewRequestV1({
    repository: { scope },
    config: { model },
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
  model: string,
): ReviewBudgetPolicy => ({
  ...config.requestBudget,
  fixedRequestOverheadTokens: Math.max(
    config.requestBudget.fixedRequestOverheadTokens,
    requestEnvelopeTokens(scope, model),
  ),
});

const buildReviewReport = (
  scope: ReviewScope,
  diff: GitDiff,
  selection: ReviewSelectionV1,
  findings: ReadonlyArray<ReviewFindingV1>,
  privacy: ReviewAllowedPrivacyDecision,
  workload: ResolvedReviewConfig["workload"],
  redaction: ReviewRedactionSummaryV1,
): ReviewReportV7 => {
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

  return decodeReviewReportV7({
    schemaVersion: 7,
    scope,
    privacy,
    // The decision was observed during this run, not assumed by a migration.
    privacyEvidence: "recorded",
    workload,
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
    redaction,
    findings,
  });
};

interface PreparedReviewRequest {
  readonly diff: GitDiff;
  readonly request: ReviewRequestV1;
  readonly selection: ReviewSelectionV1;
  readonly redaction: ReviewRedactionSummaryV1;
}

interface ResolvedReview {
  readonly config: ResolvedReviewConfig;
  readonly engine: ResolvedReviewEngine;
  readonly git: GitService["Service"];
  readonly repository: { readonly root: string };
}

const prepareReviewRequest = (
  resolved: ResolvedReview,
  scope: ReviewScope,
): Effect.Effect<PreparedReviewRequest, GitError> =>
  Effect.gen(function* () {
    const diff = yield* resolved.git.readDiff(resolved.repository, scope);
    // Redaction runs before selection so the budget measures the bytes that are
    // actually sent, and so a secret in a dropped hunk never reaches the engine.
    const reviewableFiles = redactReviewFileContents(
      textFiles(diff).map(({ path, source, fileHeader, hunks }) => ({
        path,
        source,
        fileHeader,
        hunks: hunks.map(({ patch }) => ({ patch })),
      })),
    );
    const selection = selectReviewHunks({
      files: reviewableFiles,
      policy: effectiveBudgetPolicy(
        scope,
        resolved.config,
        resolved.engine.model,
      ),
    });
    // The request tree pass stays the single outbound boundary: it also covers
    // paths and the prompt envelope, which selection does not touch.
    const { request } = redactReviewRequestV1(
      buildReviewRequestV1({
        repository: { scope },
        config: { model: resolved.engine.model },
        files: selection.files,
      }),
    );

    return {
      diff,
      request,
      selection,
      redaction: countReviewRedactions(request),
    };
  });

const withResolvedReview = <Success, Error>(
  {
    scope,
    repositoryPath,
    configOverrides = {},
  }: RunReviewInput,
  effect: (
    resolved: ResolvedReview,
  ) => Effect.Effect<Success, Error>,
): Effect.Effect<
  Success,
  RunReviewError | Error,
  GitService | ConfigService | ReviewEngineRegistry
> =>
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const git = yield* GitService;
    const engineRegistry = yield* ReviewEngineRegistry;
    const repository = yield* git.resolveRepository(repositoryPath);
    const config = yield* configService.load(repository, configOverrides);
    const engine = yield* engineRegistry.resolve(config);
    return yield* effect({ config, engine, git, repository }).pipe(
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
  GitService | ConfigService | ReviewEngineRegistry
> =>
  withResolvedReview(input, (resolved) =>
    prepareReviewRequest(resolved, input.scope).pipe(
      Effect.map(({ request }) => request),
    )
  );

export const runReview = (
  input: RunReviewInput,
): Effect.Effect<
  ReviewReportV7,
  RunReviewError,
  GitService | ConfigService | ReviewEngineRegistry
> =>
  withResolvedReview(
    input,
    Effect.fn(function* (resolved) {
      const privacy = yield* enforceReviewPrivacy(
        decideReviewPrivacy(
          resolved.config.privacy,
          resolved.engine.transport,
        ),
      );
      const engine = yield* resolved.engine.acquire;
      const { diff, request, selection, redaction } = yield* prepareReviewRequest(
        resolved,
        input.scope,
      );
      const findings = selection.files.length > 0
        ? yield* engine.review(request, {
          concurrency: resolved.config.concurrency,
          timeoutMilliseconds: resolved.config.timeoutMs,
          maxOutputTokens:
            resolved.config.requestBudget.outputReserveTokens,
        })
        : [];

      return buildReviewReport(
        input.scope,
        diff,
        selection,
        findings,
        privacy,
        resolved.config.workload,
        redaction,
      );
    }),
  );

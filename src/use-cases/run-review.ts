import * as Clock from "effect/Clock";
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
  ReviewEngineConfigurationError,
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

/**
 * A cloud engine must reserve output tokens, and the failure has to name the
 * key the user actually sets. The check lives here because this is the only
 * layer that sees both the resolved config and the engine's transport.
 */
const requireCloudOutputReserve = (
  resolved: ResolvedReview,
): Effect.Effect<void, ReviewEngineConfigurationError> =>
  resolved.engine.transport === "cloud" &&
    resolved.config.requestBudget.outputReserveTokens < 1
    ? Effect.fail(
      new ReviewEngineConfigurationError({
        engine: resolved.engine.engineId,
        field: "review.requestBudget.outputReserveTokens",
        message:
          "Expected at least 1 reserved output token for a cloud review engine.",
      }),
    )
    : Effect.void;

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
  /**
   * Budget the engine may still spend, always strictly smaller than the outer
   * review deadline so a provider timeout surfaces as an engine error instead
   * of the generic review timeout.
   */
  readonly remainingEngineBudget: Effect.Effect<number>;
}

/**
 * Slice of the review deadline kept for mapping and rendering the engine's own
 * timeout error after it fires.
 */
const engineTimeoutReserveMilliseconds = 250;

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
    const { request, redaction } = redactReviewRequestV1(
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
      redaction,
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
    const startedAt = yield* Clock.currentTimeNanos;
    const remainingEngineBudget = Clock.currentTimeNanos.pipe(
      Effect.map((now) => {
        const elapsedNanoseconds = now > startedAt ? now - startedAt : 0n;
        const elapsedMilliseconds = Number(
          (elapsedNanoseconds + 999_999n) / 1_000_000n,
        );

        return Math.max(
          1,
          config.timeoutMs - elapsedMilliseconds -
            engineTimeoutReserveMilliseconds,
        );
      }),
    );

    return yield* effect({
      config,
      engine,
      git,
      repository,
      remainingEngineBudget,
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
      yield* requireCloudOutputReserve(resolved);
      const engine = yield* resolved.engine.acquire;
      const { diff, request, selection, redaction } = yield* prepareReviewRequest(
        resolved,
        input.scope,
      );
      const findings = selection.files.length > 0
        ? yield* engine.review(request, {
          concurrency: resolved.config.concurrency,
          timeoutMilliseconds: yield* resolved.remainingEngineBudget,
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

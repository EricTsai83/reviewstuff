import * as Schema from "effect/Schema";
import type { ReviewFileSource } from "../domain/review-file";

const NonEmptyStringSchema = Schema.String.check(
  Schema.isMinLength(1, { message: "must not be empty" }),
);
const NonNegativeIntegerSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0, { message: "must not be negative" }),
);
const ReviewFileSourceSchema = Schema.Literals([
  "staged",
  "working-tree",
  "untracked",
]);

const SelectedReviewFileV1Schema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  patch: Schema.String,
});

const ReviewedSelectionCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("reviewed"),
  selectedHunks: NonNegativeIntegerSchema,
  totalHunks: NonNegativeIntegerSchema,
});
const TruncatedSelectionCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("truncated"),
  reason: Schema.Literal("request-budget"),
  selectedHunks: NonNegativeIntegerSchema,
  totalHunks: NonNegativeIntegerSchema,
});
const SkippedSelectionCoverageSchema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  status: Schema.Literal("skipped"),
  reason: Schema.Literal("request-budget"),
  selectedHunks: Schema.Literal(0),
  totalHunks: NonNegativeIntegerSchema,
});

const ReviewSelectionCoverageV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  complete: Schema.Boolean,
  files: Schema.Array(
    Schema.Union([
      ReviewedSelectionCoverageSchema,
      TruncatedSelectionCoverageSchema,
      SkippedSelectionCoverageSchema,
    ]),
  ),
});

const ReviewSelectionEstimateV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  unit: Schema.Literal("tokens"),
  maxTokens: NonNegativeIntegerSchema,
  fixedRequestOverheadTokens: NonNegativeIntegerSchema,
  outputReserveTokens: NonNegativeIntegerSchema,
  selectedRequestTokens: NonNegativeIntegerSchema,
  totalReservedTokens: NonNegativeIntegerSchema,
  fitsBudget: Schema.Boolean,
});

export const ReviewSelectionV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  files: Schema.Array(SelectedReviewFileV1Schema),
  coverage: ReviewSelectionCoverageV1Schema,
  estimate: ReviewSelectionEstimateV1Schema,
});

export type ReviewSelectionV1 = typeof ReviewSelectionV1Schema.Type;

export interface ReviewBudgetHunk {
  readonly patch: string;
}

export interface ReviewBudgetFile {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly fileHeader: string;
  readonly hunks: ReadonlyArray<ReviewBudgetHunk>;
}

export interface ReviewBudgetPolicy {
  readonly maxTokens: number;
  readonly fixedRequestOverheadTokens: number;
  readonly outputReserveTokens: number;
}

export interface ReviewRequestEstimator {
  readonly unit: "tokens";
  readonly estimate: (serializedRequest: string) => number;
}

export interface SelectReviewHunksInput {
  readonly files: ReadonlyArray<ReviewBudgetFile>;
  readonly policy: ReviewBudgetPolicy;
  readonly estimator?: ReviewRequestEstimator;
}

const utf8Encoder = new TextEncoder();

// UTF-8 bytes are a conservative tokenizer fallback: JSON escaping is applied
// first, and every token must represent at least one byte of serialized input.
export const fallbackReviewRequestEstimator: ReviewRequestEstimator = {
  unit: "tokens",
  estimate: (serializedRequest) =>
    utf8Encoder.encode(serializedRequest).byteLength,
};

const compareFiles = (left: ReviewBudgetFile, right: ReviewBudgetFile): number =>
  left.path < right.path
    ? -1
    : left.path > right.path
    ? 1
    : left.source < right.source
    ? -1
    : left.source > right.source
    ? 1
    : 0;

const assertNonNegativeSafeInteger = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
};

const sumTokenCounts = (...values: ReadonlyArray<number>): number => {
  const total = values.reduce((sum, value) => sum + value, 0);
  assertNonNegativeSafeInteger("combined token count", total);
  return total;
};

const validateInput = (
  files: ReadonlyArray<ReviewBudgetFile>,
  policy: ReviewBudgetPolicy,
): void => {
  assertNonNegativeSafeInteger("maxTokens", policy.maxTokens);
  assertNonNegativeSafeInteger(
    "fixedRequestOverheadTokens",
    policy.fixedRequestOverheadTokens,
  );
  assertNonNegativeSafeInteger(
    "outputReserveTokens",
    policy.outputReserveTokens,
  );
  sumTokenCounts(
    policy.fixedRequestOverheadTokens,
    policy.outputReserveTokens,
  );

  const identities = new Set<string>();
  for (const file of files) {
    if (file.path.length === 0) {
      throw new RangeError("file path must not be empty");
    }

    const identity = `${file.source}\0${file.path}`;
    if (identities.has(identity)) {
      throw new RangeError(
        `duplicate review file identity: ${file.source}:${file.path}`,
      );
    }
    identities.add(identity);
  }
};

const selectedFiles = (
  files: ReadonlyArray<ReviewBudgetFile>,
  selectedHunks: ReadonlyArray<ReadonlySet<number>>,
  selectedMetadataFiles: ReadonlySet<number>,
): ReadonlyArray<typeof SelectedReviewFileV1Schema.Type> =>
  files.flatMap((file, fileIndex) => {
    const indexes = selectedHunks[fileIndex];
    const selected = file.hunks.filter((_hunk, hunkIndex) =>
      indexes?.has(hunkIndex)
    );
    const included = selected.length > 0 || selectedMetadataFiles.has(fileIndex);

    return included
      ? [{
          path: file.path,
          source: file.source,
          patch: `${file.fileHeader}${selected.map((hunk) => hunk.patch).join("")}`,
        }]
      : [];
  });

const estimateSelectedRequest = (
  files: ReadonlyArray<typeof SelectedReviewFileV1Schema.Type>,
  estimator: ReviewRequestEstimator,
): number => {
  if (files.length === 0) {
    return 0;
  }

  const estimate = estimator.estimate(JSON.stringify(files));
  assertNonNegativeSafeInteger("request estimate", estimate);
  return estimate;
};

export const decodeReviewSelectionV1 = (input: unknown): ReviewSelectionV1 =>
  Schema.decodeUnknownSync(ReviewSelectionV1Schema)(input, {
    onExcessProperty: "error",
  });

export const selectReviewHunks = ({
  files: unsortedFiles,
  policy,
  estimator = fallbackReviewRequestEstimator,
}: SelectReviewHunksInput): ReviewSelectionV1 => {
  validateInput(unsortedFiles, policy);

  const files = [...unsortedFiles].sort(compareFiles);
  const selectedHunks = files.map(() => new Set<number>());
  const selectedMetadataFiles = new Set<number>();
  const rounds = files.reduce(
    (maximum, file) => Math.max(maximum, Math.max(1, file.hunks.length)),
    0,
  );

  let requestFiles: ReadonlyArray<typeof SelectedReviewFileV1Schema.Type> = [];
  let selectedRequestTokens = 0;

  for (let hunkIndex = 0; hunkIndex < rounds; hunkIndex += 1) {
    for (const [fileIndex, file] of files.entries()) {
      const metadataOnly = file.hunks.length === 0 && hunkIndex === 0;
      if (!metadataOnly && file.hunks[hunkIndex] === undefined) {
        continue;
      }

      if (metadataOnly) {
        selectedMetadataFiles.add(fileIndex);
      } else {
        selectedHunks[fileIndex]?.add(hunkIndex);
      }

      const candidateFiles = selectedFiles(
        files,
        selectedHunks,
        selectedMetadataFiles,
      );
      const candidateRequestTokens = estimateSelectedRequest(
        candidateFiles,
        estimator,
      );
      const candidateTotal = sumTokenCounts(
        policy.fixedRequestOverheadTokens,
        policy.outputReserveTokens,
        candidateRequestTokens,
      );

      if (candidateTotal <= policy.maxTokens) {
        requestFiles = candidateFiles;
        selectedRequestTokens = candidateRequestTokens;
        continue;
      }

      if (metadataOnly) {
        selectedMetadataFiles.delete(fileIndex);
      } else {
        selectedHunks[fileIndex]?.delete(hunkIndex);
      }
    }
  }

  const coverageFiles = files.map((file, fileIndex) => {
    const selectedHunkCount = selectedHunks[fileIndex]?.size ?? 0;
    const metadataSelected = selectedMetadataFiles.has(fileIndex);
    const completelySelected = file.hunks.length === 0
      ? metadataSelected
      : selectedHunkCount === file.hunks.length;

    if (completelySelected) {
      return {
        path: file.path,
        source: file.source,
        status: "reviewed" as const,
        selectedHunks: selectedHunkCount,
        totalHunks: file.hunks.length,
      };
    }

    if (selectedHunkCount > 0) {
      return {
        path: file.path,
        source: file.source,
        status: "truncated" as const,
        reason: "request-budget" as const,
        selectedHunks: selectedHunkCount,
        totalHunks: file.hunks.length,
      };
    }

    return {
      path: file.path,
      source: file.source,
      status: "skipped" as const,
      reason: "request-budget" as const,
      selectedHunks: 0 as const,
      totalHunks: file.hunks.length,
    };
  });
  const totalReservedTokens = sumTokenCounts(
    policy.fixedRequestOverheadTokens,
    policy.outputReserveTokens,
    selectedRequestTokens,
  );

  return decodeReviewSelectionV1({
    schemaVersion: 1,
    files: requestFiles,
    coverage: {
      schemaVersion: 1,
      complete: coverageFiles.every((file) => file.status === "reviewed"),
      files: coverageFiles,
    },
    estimate: {
      schemaVersion: 1,
      unit: estimator.unit,
      maxTokens: policy.maxTokens,
      fixedRequestOverheadTokens: policy.fixedRequestOverheadTokens,
      outputReserveTokens: policy.outputReserveTokens,
      selectedRequestTokens,
      totalReservedTokens,
      fitsBudget: totalReservedTokens <= policy.maxTokens,
    },
  });
};

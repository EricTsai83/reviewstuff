import * as Schema from "effect/Schema";
import {
  compareReviewFileIdentity,
  type ReviewFileSource,
  ReviewFileSourceSchema,
  RequestBudgetSkippedFileCoverageSchema,
  ReviewedFileCoverageSchema,
  TruncatedFileCoverageSchema,
} from "../domain/review-file";
import {
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
} from "../shared/schema-primitives";

const SelectedReviewFileV1Schema = Schema.Struct({
  path: NonEmptyStringSchema,
  source: ReviewFileSourceSchema,
  patch: Schema.String,
});

const ReviewSelectionCoverageV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  complete: Schema.Boolean,
  files: Schema.Array(
    Schema.Union([
      ReviewedFileCoverageSchema,
      TruncatedFileCoverageSchema,
      RequestBudgetSkippedFileCoverageSchema,
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
  /**
   * Estimates one serialized JSON fragment. Selection estimates each file's
   * serialization separately and sums the parts, so estimates must be
   * additive under string concatenation; the fallback byte estimator is
   * exactly additive, and tokenizer-based estimators are approximately so.
   */
  readonly estimate: (serializedFragment: string) => number;
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
  estimate: (serializedFragment) =>
    utf8Encoder.encode(serializedFragment).byteLength,
};

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

const serializeSelectedFile = (
  file: ReviewBudgetFile,
  hunkIndexes: ReadonlySet<number>,
): string => {
  const selected = file.hunks.filter((_hunk, hunkIndex) =>
    hunkIndexes.has(hunkIndex)
  );

  return JSON.stringify({
    path: file.path,
    source: file.source,
    patch: `${file.fileHeader}${selected.map((hunk) => hunk.patch).join("")}`,
  });
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

  const files = [...unsortedFiles].sort(compareReviewFileIdentity);
  const selectedHunks = files.map(() => new Set<number>());
  const selectedMetadataFiles = new Set<number>();
  const rounds = files.reduce(
    (maximum, file) => Math.max(maximum, Math.max(1, file.hunks.length)),
    0,
  );

  // The selection estimate decomposes the serialized files array into its
  // enclosing brackets, separators, and per-file fragments, so each candidate
  // re-estimates only the file it changes instead of the whole selection.
  const arrayBracketTokens = estimator.estimate("[]");
  const arraySeparatorTokens = estimator.estimate(",");
  assertNonNegativeSafeInteger("array bracket estimate", arrayBracketTokens);
  assertNonNegativeSafeInteger("array separator estimate", arraySeparatorTokens);
  const perFileTokens: Array<number | undefined> = files.map(() => undefined);
  let includedFiles = 0;
  let includedFileTokens = 0;
  let selectedRequestTokens = 0;

  const requestTokensFor = (fileCount: number, fileTokens: number): number =>
    fileCount === 0
      ? 0
      : sumTokenCounts(
          fileTokens,
          arrayBracketTokens,
          (fileCount - 1) * arraySeparatorTokens,
        );

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

      const previousFileTokens = perFileTokens[fileIndex];
      const candidateFileTokens = estimator.estimate(
        serializeSelectedFile(file, selectedHunks[fileIndex] ?? new Set()),
      );
      assertNonNegativeSafeInteger("file estimate", candidateFileTokens);
      const candidateIncludedFiles = includedFiles +
        (previousFileTokens === undefined ? 1 : 0);
      const candidateIncludedFileTokens = includedFileTokens -
        (previousFileTokens ?? 0) + candidateFileTokens;
      const candidateRequestTokens = requestTokensFor(
        candidateIncludedFiles,
        candidateIncludedFileTokens,
      );
      const candidateTotal = sumTokenCounts(
        policy.fixedRequestOverheadTokens,
        policy.outputReserveTokens,
        candidateRequestTokens,
      );

      if (candidateTotal <= policy.maxTokens) {
        perFileTokens[fileIndex] = candidateFileTokens;
        includedFiles = candidateIncludedFiles;
        includedFileTokens = candidateIncludedFileTokens;
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
    files: selectedFiles(files, selectedHunks, selectedMetadataFiles),
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

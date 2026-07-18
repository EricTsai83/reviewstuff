export type ReviewFileSource = "staged" | "working-tree" | "untracked";

export interface LegacyReviewedFileCoverage {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly status: "reviewed";
}

export interface ReviewedFileCoverage {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly status: "reviewed";
  readonly selectedHunks: number;
  readonly totalHunks: number;
}

export interface TruncatedFileCoverage {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly status: "truncated";
  readonly reason: "request-budget";
  readonly selectedHunks: number;
  readonly totalHunks: number;
}

export interface BinarySkippedFile {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly reason: "binary";
}

export interface LargeSkippedFile {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly reason: "file-too-large";
  readonly sizeBytes: string;
  readonly limitBytes: number;
}

export type ReviewSkippedFile = BinarySkippedFile | LargeSkippedFile;

export interface RequestBudgetSkippedFile {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly reason: "request-budget";
  readonly selectedHunks: 0;
  readonly totalHunks: number;
}

export type ReviewFileCoverage =
  | ReviewedFileCoverage
  | TruncatedFileCoverage
  | ((ReviewSkippedFile | RequestBudgetSkippedFile) & {
      readonly status: "skipped";
    });

export interface ReviewCoverageV1 {
  readonly schemaVersion: 1;
  readonly complete: boolean;
  readonly files: ReadonlyArray<
    | LegacyReviewedFileCoverage
    | (ReviewSkippedFile & { readonly status: "skipped" })
  >;
}

export interface ReviewCoverageV2 {
  readonly schemaVersion: 2;
  readonly complete: boolean;
  readonly files: ReadonlyArray<ReviewFileCoverage>;
}

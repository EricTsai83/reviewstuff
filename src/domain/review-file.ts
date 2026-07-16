export type ReviewFileSource = "staged" | "working-tree" | "untracked";

export interface ReviewedFileCoverage {
  readonly path: string;
  readonly source: ReviewFileSource;
  readonly status: "reviewed";
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

export type ReviewFileCoverage =
  | ReviewedFileCoverage
  | (ReviewSkippedFile & { readonly status: "skipped" });

export interface ReviewCoverageV1 {
  readonly schemaVersion: 1;
  readonly complete: boolean;
  readonly files: ReadonlyArray<ReviewFileCoverage>;
}

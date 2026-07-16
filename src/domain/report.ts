import type { Finding } from "./finding";
import type { ReviewCoverageV1 } from "./review-file";
import type { ReviewScope } from "./scope";

export interface ReviewReportSummary {
  readonly changedFiles: number;
  readonly reviewedFiles: number;
  readonly skippedFiles: number;
  readonly findings: number;
}

export interface ReviewReport {
  readonly schemaVersion: 2;
  readonly scope: ReviewScope;
  readonly summary: ReviewReportSummary;
  readonly coverage: ReviewCoverageV1;
  readonly findings: ReadonlyArray<Finding>;
}

import type { Finding } from "./finding";
import type { ReviewScope } from "./scope";

export interface ReviewReportSummary {
  readonly changedFiles: number;
  readonly findings: number;
}

export interface ReviewReport {
  readonly schemaVersion: 1;
  readonly scope: ReviewScope;
  readonly summary: ReviewReportSummary;
  readonly findings: ReadonlyArray<Finding>;
}

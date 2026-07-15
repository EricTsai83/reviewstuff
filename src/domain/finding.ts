export type FindingSeverity = "warning";

export interface Finding {
  readonly id: string;
  readonly ruleId: "fake-marker";
  readonly severity: FindingSeverity;
  readonly message: string;
  readonly file: string;
  readonly line: number;
}

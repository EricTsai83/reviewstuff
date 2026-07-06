import * as Schema from "effect/Schema"

export const Severity = Schema.Literals(["info", "warning", "error", "critical"])
export type Severity = typeof Severity.Type

export const Category = Schema.Literals([
  "correctness",
  "security",
  "architecture",
  "typescript",
  "performance",
  "testing",
  "style"
])
export type Category = typeof Category.Type

/** 模型必須回傳的單條 finding。保持扁平（無 transform、無遞迴）以便產生乾淨的 JSON Schema。 */
export const Finding = Schema.Struct({
  file: Schema.String.annotate({ description: "repo-relative file path" }),
  line: Schema.optionalKey(Schema.Int.annotate({ description: "line number in the NEW file" })),
  endLine: Schema.optionalKey(Schema.Int),
  severity: Severity,
  category: Category,
  title: Schema.String.annotate({ description: "imperative, <= 80 chars" }),
  rationale: Schema.String.annotate({ description: "why this is a problem; cite the code" }),
  suggestion: Schema.optionalKey(Schema.String.annotate({ description: "concrete fix" })),
  confidence: Schema.Number.annotate({ description: "0..1" })
})
export type Finding = typeof Finding.Type

/** 引擎（模型）的原始回傳。 */
export const ReviewerOutput = Schema.Struct({
  findings: Schema.Array(Finding)
})
export type ReviewerOutput = typeof ReviewerOutput.Type

const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3
}

export const severityAtLeast = (severity: Severity, threshold: Severity): boolean =>
  SEVERITY_ORDER[severity] >= SEVERITY_ORDER[threshold]

export const maxSeverity = (a: Severity, b: Severity): Severity =>
  SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b

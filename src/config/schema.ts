import * as Schema from "effect/Schema"

export const ReviewerConfig = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  model: Schema.optionalKey(Schema.String.annotate({ description: "provider/modelId" })),
  engine: Schema.optionalKey(Schema.Literals(["pi", "claude", "codex"])),
  /** 自訂 reviewer：指向 prompt 檔（相對 repo root）。非內建 id 必填。 */
  prompt: Schema.optionalKey(Schema.String.annotate({ description: "自訂 reviewer 的 prompt 檔路徑" })),
  description: Schema.optionalKey(Schema.String)
})
export type ReviewerConfig = typeof ReviewerConfig.Type

export const VerifyConfig = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  model: Schema.optionalKey(Schema.String)
})
export type VerifyConfig = typeof VerifyConfig.Type

/** fix 驗證閘門：全綠才建議套用。shell 指令在暫存 worktree 執行。 */
export const GatesConfig = Schema.Struct({
  lint: Schema.optionalKey(Schema.String),
  typecheck: Schema.optionalKey(Schema.String),
  test: Schema.optionalKey(Schema.String)
})
export type GatesConfig = typeof GatesConfig.Type

export const FileConfig = Schema.Struct({
  profile: Schema.optionalKey(Schema.Literals(["quick", "standard", "thorough"])),
  concurrency: Schema.optionalKey(Schema.Int),
  timeoutSeconds: Schema.optionalKey(Schema.Int),
  failOn: Schema.optionalKey(Schema.Literals(["critical", "error", "warning", "info", "none"])),
  rulesFile: Schema.optionalKey(Schema.String),
  verify: Schema.optionalKey(VerifyConfig),
  gates: Schema.optionalKey(GatesConfig),
  reviewers: Schema.optionalKey(Schema.Record(Schema.String, ReviewerConfig))
})
export type FileConfig = typeof FileConfig.Type

export const EMPTY_FILE_CONFIG: FileConfig = {}

import * as Schema from "effect/Schema"

export const ReviewerConfig = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  model: Schema.optionalKey(Schema.String.annotate({ description: "provider/modelId" })),
  engine: Schema.optionalKey(Schema.Literals(["pi", "claude", "codex"]))
})
export type ReviewerConfig = typeof ReviewerConfig.Type

export const VerifyConfig = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  model: Schema.optionalKey(Schema.String)
})
export type VerifyConfig = typeof VerifyConfig.Type

export const FileConfig = Schema.Struct({
  profile: Schema.optionalKey(Schema.Literals(["quick", "standard", "thorough"])),
  concurrency: Schema.optionalKey(Schema.Int),
  timeoutSeconds: Schema.optionalKey(Schema.Int),
  failOn: Schema.optionalKey(Schema.Literals(["critical", "error", "warning", "info", "none"])),
  rulesFile: Schema.optionalKey(Schema.String),
  verify: Schema.optionalKey(VerifyConfig),
  reviewers: Schema.optionalKey(Schema.Record(Schema.String, ReviewerConfig))
})
export type FileConfig = typeof FileConfig.Type

export const EMPTY_FILE_CONFIG: FileConfig = {}

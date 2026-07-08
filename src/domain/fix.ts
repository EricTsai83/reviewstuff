import * as Schema from "effect/Schema"

/** 一個檔案的完整改寫（整檔內容取代，避免 patch 對不上的脆弱性）。 */
export const FileFix = Schema.Struct({
  file: Schema.String.annotate({ description: "repo-relative path to rewrite" }),
  content: Schema.String.annotate({ description: "full new file content" }),
  explanation: Schema.String.annotate({ description: "what changed and why" })
})
export type FileFix = typeof FileFix.Type

export const FixOutput = Schema.Struct({
  fixes: Schema.Array(FileFix)
})
export type FixOutput = typeof FixOutput.Type

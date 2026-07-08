import { Type } from "@earendil-works/pi-ai"

/** record_fixes 工具參數（pi）。 */
export const FIXES_TOOL_SCHEMA = Type.Object({
  fixes: Type.Array(
    Type.Object({
      file: Type.String({ description: "repo-relative path to rewrite" }),
      content: Type.String({ description: "full new file content" }),
      explanation: Type.String({ description: "what changed and why" })
    })
  )
})

/** claude --json-schema 用。 */
export const FIXES_JSON_SCHEMA_STRING = JSON.stringify(FIXES_TOOL_SCHEMA)

/** codex OpenAI strict 模式：全欄位 required、additionalProperties:false。 */
export const FIXES_STRICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    fixes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string", description: "repo-relative path to rewrite" },
          content: { type: "string", description: "full new file content" },
          explanation: { type: "string", description: "what changed and why" }
        },
        required: ["file", "content", "explanation"],
        additionalProperties: false
      }
    }
  },
  required: ["fixes"],
  additionalProperties: false
} as const

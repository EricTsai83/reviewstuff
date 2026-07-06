import { Type } from "@earendil-works/pi-ai"

/**
 * domain/finding.ts 的 model-facing 鏡像（TypeBox）。
 * TypeBox schema 本身就是合法 JSON Schema：
 * - PiEngine 直接當 record_findings 的工具參數
 * - ClaudeEngine JSON.stringify 後餵 --json-schema
 * 收到的資料仍以 effect/Schema（domain）decode 為唯一真相之門。
 */
export const FINDINGS_TOOL_SCHEMA = Type.Object({
  findings: Type.Array(
    Type.Object({
      file: Type.String({ description: "repo-relative file path" }),
      line: Type.Optional(Type.Integer({ minimum: 1, description: "line number in the NEW file" })),
      endLine: Type.Optional(Type.Integer({ minimum: 1 })),
      severity: Type.Union([
        Type.Literal("info"),
        Type.Literal("warning"),
        Type.Literal("error"),
        Type.Literal("critical")
      ]),
      category: Type.Union([
        Type.Literal("correctness"),
        Type.Literal("security"),
        Type.Literal("architecture"),
        Type.Literal("typescript"),
        Type.Literal("performance"),
        Type.Literal("testing"),
        Type.Literal("style")
      ]),
      title: Type.String({ description: "imperative, <= 80 chars" }),
      rationale: Type.String({ description: "why this is a problem; cite the code" }),
      suggestion: Type.Optional(Type.String({ description: "concrete fix" })),
      confidence: Type.Number({ minimum: 0, maximum: 1 })
    })
  )
})

export const FINDINGS_JSON_SCHEMA_STRING = JSON.stringify(FINDINGS_TOOL_SCHEMA)

const SEVERITIES = ["info", "warning", "error", "critical"]
const CATEGORIES = ["correctness", "security", "architecture", "typescript", "performance", "testing", "style"]

/**
 * OpenAI strict structured-output 變體（codex exec --output-schema）：
 * 所有欄位必須列在 required，可選欄位改為 nullable。
 * 引擎收到後要先把 null 欄位剝掉再過 domain Schema。
 */
export const FINDINGS_STRICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string", description: "repo-relative file path" },
          line: { type: ["integer", "null"], description: "line number in the NEW file" },
          endLine: { type: ["integer", "null"] },
          severity: { type: "string", enum: SEVERITIES },
          category: { type: "string", enum: CATEGORIES },
          title: { type: "string", description: "imperative, <= 80 chars" },
          rationale: { type: "string", description: "why this is a problem; cite the code" },
          suggestion: { type: ["string", "null"], description: "concrete fix" },
          confidence: { type: "number", description: "0..1" }
        },
        required: [
          "file",
          "line",
          "endLine",
          "severity",
          "category",
          "title",
          "rationale",
          "suggestion",
          "confidence"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["findings"],
  additionalProperties: false
} as const

/** 把 strict 模式回傳的 null 欄位剝掉，讓 domain Schema（optionalKey）能 decode。 */
export const stripNullFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripNullFields)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== null)
        .map(([key, entryValue]) => [key, stripNullFields(entryValue)])
    )
  }
  return value
}

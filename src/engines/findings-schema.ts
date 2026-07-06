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

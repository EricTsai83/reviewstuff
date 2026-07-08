import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { EngineError } from "../domain/errors.ts"
import type { ReviewerOutput } from "../domain/finding.ts"
import type { FixOutput } from "../domain/fix.ts"
import type { EngineId, ModelRef, ResolvedReviewer } from "../reviewers/registry.ts"

export interface ReviewRequest {
  readonly reviewer: ResolvedReviewer
  /** unified diff 全文 */
  readonly diff: string
  /** 額外 context（專案規則等），可為空字串 */
  readonly contextText: string
  readonly timeoutMs: number
}

export interface ReviewUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly costUsd?: number
}

export interface ReviewResult {
  readonly output: ReviewerOutput
  readonly usage?: ReviewUsage
}

/** fix 產生請求：把 findings + 相關檔案內容交給模型，要它回整檔改寫。 */
export interface FixRequest {
  readonly model: ModelRef
  readonly engine: EngineId
  /** 已經組好的使用者提示（含 findings 與檔案內容） */
  readonly userContent: string
  readonly timeoutMs: number
}

export interface FixResult {
  readonly output: FixOutput
  readonly usage?: ReviewUsage
}

export interface ReviewEngine {
  readonly id: EngineId
  readonly review: (request: ReviewRequest) => Effect.Effect<ReviewResult, EngineError>
  readonly generateFixes: (request: FixRequest) => Effect.Effect<FixResult, EngineError>
}

export const FIX_SYSTEM_PROMPT =
  "You are a precise code-fixing assistant. You are given code-review findings and the current content of the affected files. " +
  "Produce corrected FULL file contents that resolve the findings without changing unrelated behavior. " +
  "Only include files you actually change. Preserve the file's existing style and imports. " +
  "Record your fixes via the structured output channel; do not write prose outside it."

export interface EnginesShape {
  readonly get: (id: EngineId) => ReviewEngine
}

/** 引擎註冊表——測試用 FakeEngine layer 替換這個 service。 */
export class Engines extends Context.Service<Engines, EnginesShape>()("Engines") {}

/** reviewer prompt 的統一組裝：所有引擎共用，確保跨引擎行為一致。 */
export const buildUserPrompt = (request: ReviewRequest): string => {
  const parts = [
    "Review the following diff and record your findings via the structured output channel.",
    request.contextText.trim() ? `Project context:\n${request.contextText.trim()}` : "",
    "```diff",
    request.diff,
    "```"
  ]
  return parts.filter(Boolean).join("\n\n")
}

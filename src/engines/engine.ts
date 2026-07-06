import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { EngineError } from "../domain/errors.ts"
import type { ReviewerOutput } from "../domain/finding.ts"
import type { EngineId, ResolvedReviewer } from "../reviewers/registry.ts"

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

export interface ReviewEngine {
  readonly id: EngineId
  readonly review: (request: ReviewRequest) => Effect.Effect<ReviewResult, EngineError>
}

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

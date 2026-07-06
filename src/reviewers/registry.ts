import { CORRECTNESS_PROMPT } from "./prompts/correctness.ts"
import { SECURITY_PROMPT } from "./prompts/security.ts"
import { TYPESCRIPT_PROMPT } from "./prompts/typescript.ts"

export type EngineId = "pi" | "claude"

/** `provider/modelId`，provider 用 pi 的 provider id（openai-codex、anthropic、google…）。 */
export interface ModelRef {
  readonly provider: string
  readonly modelId: string
}

export const parseModelRef = (ref: string): ModelRef | null => {
  const slash = ref.indexOf("/")
  if (slash <= 0 || slash === ref.length - 1) return null
  return { provider: ref.slice(0, slash), modelId: ref.slice(slash + 1) }
}

export const formatModelRef = (model: ModelRef): string => `${model.provider}/${model.modelId}`

export interface ReviewerDef {
  readonly id: string
  readonly description: string
  readonly systemPrompt: string
  readonly defaultModel: string
  /** 回傳 false 表示這個 diff 不需要此 reviewer（例如 diff 沒有 .ts 檔） */
  readonly appliesTo: (changedFiles: readonly string[]) => boolean
}

export const BUILTIN_REVIEWERS: readonly ReviewerDef[] = [
  {
    id: "correctness",
    description: "邏輯錯誤、null 解參考、回歸、async 陷阱",
    systemPrompt: CORRECTNESS_PROMPT,
    defaultModel: "openai-codex/gpt-5.5",
    appliesTo: () => true
  },
  {
    id: "security",
    description: "秘密外洩、注入、認證授權、敏感資料",
    systemPrompt: SECURITY_PROMPT,
    defaultModel: "anthropic/claude-sonnet-5",
    appliesTo: () => true
  },
  {
    id: "typescript",
    description: "型別安全侵蝕（any、as、非空斷言）",
    systemPrompt: TYPESCRIPT_PROMPT,
    defaultModel: "openai-codex/gpt-5.5",
    appliesTo: (files) => files.some((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  }
]

/**
 * 引擎路由（風險平衡預設）：
 * anthropic 模型 → claude 官方 CLI；其他 provider → pi in-process。
 * 明確指定（reviewer config 或 --engine flag）優先。
 */
export const routeEngine = (model: ModelRef, explicit?: EngineId): EngineId => {
  if (explicit) return explicit
  return model.provider === "anthropic" ? "claude" : "pi"
}

/** orchestrator 執行單位：一個已解析完成的 reviewer。 */
export interface ResolvedReviewer {
  readonly id: string
  readonly systemPrompt: string
  readonly model: ModelRef
  readonly engine: EngineId
}

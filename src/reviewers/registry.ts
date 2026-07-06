import { ARCHITECTURE_PROMPT } from "./prompts/architecture.ts"
import { CORRECTNESS_PROMPT } from "./prompts/correctness.ts"
import { frameworkPrompt } from "./prompts/framework.ts"
import { PERFORMANCE_PROMPT } from "./prompts/performance.ts"
import { SECURITY_PROMPT } from "./prompts/security.ts"
import { TYPESCRIPT_PROMPT } from "./prompts/typescript.ts"

/** 專案層級資訊（framework 偵測等），由 review command 收集後傳入 resolve。 */
export interface ProjectInfo {
  readonly frameworks: readonly string[]
}

export type EngineId = "pi" | "claude" | "codex"

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
  /** standard profile 是否預設啟用（false 的要靠 --reviewers、config 或 thorough profile 開） */
  readonly defaultEnabled: boolean
  /** 回傳 false 表示這個 diff 不需要此 reviewer（例如 diff 沒有 .ts 檔） */
  readonly appliesTo: (changedFiles: readonly string[]) => boolean
  /** 需要專案資訊的 reviewer：回傳 undefined 表示不適用（例如偵測不到框架） */
  readonly promptFor?: (info: ProjectInfo) => string | undefined
}

export const BUILTIN_REVIEWERS: readonly ReviewerDef[] = [
  {
    id: "correctness",
    description: "邏輯錯誤、null 解參考、回歸、async 陷阱",
    systemPrompt: CORRECTNESS_PROMPT,
    defaultModel: "openai-codex/gpt-5.5",
    defaultEnabled: true,
    appliesTo: () => true
  },
  {
    id: "security",
    description: "秘密外洩、注入、認證授權、敏感資料",
    systemPrompt: SECURITY_PROMPT,
    defaultModel: "anthropic/claude-sonnet-5",
    defaultEnabled: true,
    appliesTo: () => true
  },
  {
    id: "typescript",
    description: "型別安全侵蝕（any、as、非空斷言）",
    systemPrompt: TYPESCRIPT_PROMPT,
    defaultModel: "openai-codex/gpt-5.5",
    defaultEnabled: true,
    appliesTo: (files) => files.some((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  },
  {
    id: "architecture",
    description: "分層違規、依賴方向、重複抽象、洩漏的抽象",
    systemPrompt: ARCHITECTURE_PROMPT,
    defaultModel: "anthropic/claude-sonnet-5",
    defaultEnabled: false,
    appliesTo: () => true
  },
  {
    id: "performance",
    description: "O(n²)、N+1、阻塞 event loop、無界成長",
    systemPrompt: PERFORMANCE_PROMPT,
    defaultModel: "openai-codex/gpt-5.5",
    defaultEnabled: false,
    appliesTo: () => true
  },
  {
    id: "framework",
    description: "偵測到的框架（react/next/vue/effect…）最佳實踐",
    systemPrompt: "",
    defaultModel: "openai-codex/gpt-5.5",
    defaultEnabled: false,
    appliesTo: () => true,
    promptFor: (info) => (info.frameworks.length > 0 ? frameworkPrompt(info.frameworks) : undefined)
  }
]

const KNOWN_FRAMEWORKS: readonly (readonly [pkg: string, label: string])[] = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue"],
  ["nuxt", "Nuxt"],
  ["svelte", "Svelte"],
  ["@angular/core", "Angular"],
  ["express", "Express"],
  ["hono", "Hono"],
  ["fastify", "Fastify"],
  ["effect", "Effect"]
]

/** 純函式：從 package.json 內容偵測框架。 */
export const detectFrameworks = (packageJson: unknown): string[] => {
  if (packageJson === null || typeof packageJson !== "object") return []
  const manifest = packageJson as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  const deps = { ...manifest.dependencies, ...manifest.devDependencies }
  return KNOWN_FRAMEWORKS.filter(([pkg]) => pkg in deps).map(([, label]) => label)
}

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

/**
 * Phase 0 Spike A：驗證 pi library 的關鍵假設
 *
 * 用法：
 *   pnpm spike:pi login <anthropic|openai-codex>   # 訂閱 OAuth 登入，存 ~/.config/reviewstuff/auth.json
 *   pnpm spike:pi models <provider>                # 列出該 provider 的內建模型
 *   pnpm spike:pi run <provider> <modelId>         # 用 record_findings 工具對內建 buggy diff 跑一次迷你 review
 *
 * 驗證目標：
 *   1. pi-ai/oauth 的訂閱登入與 token 刷新可用（非 API key）
 *   2. agentLoop + 自訂 TypeBox 工具（record_findings）：模型會乖乖呼叫並回傳結構化 findings
 *   3. 事件流可取得 usage/cost；abort signal 生效
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { createInterface } from "node:readline/promises"

import { Type } from "@earendil-works/pi-ai"
import type { OAuthCredentials } from "@earendil-works/pi-ai"
import { getOAuthApiKey, getOAuthProvider } from "@earendil-works/pi-ai/oauth"
import { builtinModels } from "@earendil-works/pi-ai/providers/all"
import { agentLoop } from "@earendil-works/pi-agent-core"
import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core"

const AUTH_DIR = path.join(os.homedir(), ".config", "reviewstuff")
const AUTH_FILE = path.join(AUTH_DIR, "auth.json")

type AuthFile = Record<string, OAuthCredentials>

const loadAuth = (): AuthFile => {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf8")) as AuthFile
  } catch {
    return {}
  }
}

const saveAuth = (auth: AuthFile) => {
  mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(AUTH_FILE, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 })
}

// ---------------------------------------------------------------- login

const login = async (providerId: string) => {
  const provider = getOAuthProvider(providerId)
  if (!provider) {
    console.error(`OAuth provider "${providerId}" 不存在`)
    process.exit(2)
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const credentials = await provider.login({
      onAuth: (info) => {
        console.log(`\n請在瀏覽器開啟：\n  ${info.url}\n`)
        if (info.instructions) console.log(info.instructions)
      },
      onDeviceCode: (info) => {
        console.log(`\n請開啟 ${info.verificationUri}，輸入代碼：${info.userCode}\n`)
      },
      onPrompt: async (prompt) => rl.question(`${prompt.message ?? "輸入"}: `),
      onProgress: (message) => console.log(`  … ${message}`),
      onManualCodeInput: async () => rl.question("貼上授權碼: "),
      onSelect: async (prompt) => {
        console.log(`\n${prompt.message ?? "請選擇"}:`)
        prompt.options.forEach((option, index) => {
          console.log(`  [${index + 1}] ${option.label ?? option.id}`)
        })
        const answer = await rl.question("選擇編號 (預設 1): ")
        const index = Number.parseInt(answer || "1", 10) - 1
        return prompt.options[index]?.id
      }
    })

    const auth = loadAuth()
    auth[providerId] = credentials
    saveAuth(auth)
    console.log(`\n✅ ${providerId} 登入成功，credentials 已存到 ${AUTH_FILE}`)
  } finally {
    rl.close()
  }
}

// ---------------------------------------------------------------- token 解析（含刷新）

const resolveApiKey = async (providerId: string): Promise<string> => {
  const auth = loadAuth()
  if (!auth[providerId]) {
    console.error(`尚未登入 ${providerId}——先跑：pnpm spike:pi login ${providerId}`)
    process.exit(2)
  }

  const resolved = await getOAuthApiKey(providerId, auth)
  if (!resolved) {
    console.error(`無法解析 ${providerId} 的 token（可能已失效）——請重新 login`)
    process.exit(2)
  }

  auth[providerId] = resolved.newCredentials
  saveAuth(auth)
  return resolved.apiKey
}

// ---------------------------------------------------------------- run：迷你 review

const BUGGY_DIFF = `--- a/src/user.ts
+++ b/src/user.ts
@@ -1,8 +1,12 @@
 export interface User { id: string; email?: string }

+const ADMIN_TOKEN = "sk-prod-9f8e7d6c5b4a"
+
 export function domainOf(user: User): string {
-  return user.email ? user.email.split("@")[1] : ""
+  return user.email.split("@")[1].toLowerCase()
 }
+
+export function isAdmin(token: string): boolean {
+  return token == ADMIN_TOKEN
+}
`

const findingsSchema = Type.Object({
  findings: Type.Array(
    Type.Object({
      file: Type.String({ description: "repo 相對路徑" }),
      line: Type.Optional(Type.Integer({ minimum: 1, description: "新檔行號" })),
      severity: Type.Union([
        Type.Literal("info"),
        Type.Literal("warning"),
        Type.Literal("error"),
        Type.Literal("critical")
      ]),
      category: Type.Union([
        Type.Literal("correctness"),
        Type.Literal("security"),
        Type.Literal("typescript"),
        Type.Literal("style")
      ]),
      title: Type.String({ description: "80 字內，祈使句" }),
      rationale: Type.String({ description: "為什麼是問題，引用程式碼" }),
      confidence: Type.Number({ minimum: 0, maximum: 1 })
    })
  )
})

const run = async (providerId: string, modelId: string) => {
  const apiKey = await resolveApiKey(providerId)
  const models = builtinModels()
  const model = models.getModel(providerId, modelId)
  if (!model) {
    console.error(`模型 "${modelId}" 不在 provider "${providerId}" 的清單裡`)
    console.error(`可用：pnpm spike:pi models ${providerId}`)
    process.exit(2)
  }

  let recorded: unknown = null

  const recordFindings: AgentTool<typeof findingsSchema> = {
    name: "record_findings",
    label: "Record Findings",
    description:
      "Record the final structured code-review findings. MUST be called exactly once at the end of the review.",
    parameters: findingsSchema,
    execute: async (_toolCallId, params) => {
      recorded = params
      return { content: [{ type: "text", text: "findings recorded" }], details: params }
    }
  }

  const prompts: AgentMessage[] = [
    {
      role: "user",
      content: `Review this diff and record your findings via the record_findings tool:\n\n\`\`\`diff\n${BUGGY_DIFF}\`\`\``,
      timestamp: Date.now()
    }
  ]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)

  console.log(`\n▶ ${providerId}/${modelId} 開始 review …\n`)
  const events = agentLoop(
    prompts,
    {
      systemPrompt:
        "You are a precise code reviewer. Review ONLY the provided diff. " +
        "Report genuine bugs and security issues with file/line references. " +
        "When done, call record_findings exactly once with all findings. Do not write prose.",
      messages: [],
      tools: [recordFindings]
    },
    {
      model,
      convertToLlm: (messages) =>
        messages.filter(
          (message) =>
            message.role === "user" || message.role === "assistant" || message.role === "toolResult"
        ),
      getApiKey: () => apiKey
    },
    controller.signal
  )

  let usageSummary = ""
  try {
    for await (const event of events) {
      if (event.type === "tool_execution_start") console.log(`  🔧 tool: ${event.toolName ?? ""}`)
      if (event.type === "message_end" && event.message.role === "assistant") {
        const usage = event.message.usage
        usageSummary = `tokens in=${usage?.input ?? "?"} out=${usage?.output ?? "?"} cost=$${usage?.cost?.total?.toFixed?.(4) ?? "?"}`
      }
      if (event.type === "agent_end") console.log(`\n■ agent_end（${usageSummary}）`)
    }
  } finally {
    clearTimeout(timer)
  }

  if (recorded === null) {
    console.error("\n❌ 模型沒有呼叫 record_findings —— 需要調整提示策略")
    process.exit(3)
  }

  console.log("\n✅ record_findings 收到結構化輸出：\n")
  console.log(JSON.stringify(recorded, null, 2))
}

// ---------------------------------------------------------------- main

const [command, arg1, arg2] = process.argv.slice(2)

switch (command) {
  case "login":
    await login(arg1 ?? "anthropic")
    break
  case "models": {
    const models = builtinModels()
    for (const model of models.getModels(arg1 ?? "anthropic")) console.log(model.id)
    break
  }
  case "run":
    await run(arg1 ?? "openai-codex", arg2 ?? "gpt-5.5")
    break
  default:
    console.log("用法：pnpm spike:pi <login|models|run> [provider] [modelId]")
    process.exit(2)
}

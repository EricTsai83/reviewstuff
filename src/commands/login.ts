import { createInterface } from "node:readline/promises"

import { getOAuthProvider } from "@earendil-works/pi-ai/oauth"
import * as Effect from "effect/Effect"
import pc from "picocolors"

import { AUTH_FILE, loadAuthFile, saveAuthFile } from "../engines/auth.ts"
import { EXIT_CLEAN, EXIT_USAGE } from "../output/json.ts"

/** 訂閱 OAuth 登入（透過 pi-ai 的 oauth 模組）。provider：anthropic / openai-codex / github-copilot… */
export const loginCommand = (provider: string) =>
  Effect.tryPromise({
    try: async () => {
      const oauthProvider = getOAuthProvider(provider)
      if (!oauthProvider) {
        console.error(`OAuth provider "${provider}" 不存在（常用：openai-codex、anthropic、github-copilot）`)
        return EXIT_USAGE
      }

      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try {
        const credentials = await oauthProvider.login({
          onAuth: (info) => {
            console.log(`\n請在瀏覽器開啟：\n  ${info.url}\n`)
            if (info.instructions) console.log(info.instructions)
          },
          onDeviceCode: (info) => {
            console.log(`\n請開啟 ${info.verificationUri}，輸入代碼：${pc.bold(info.userCode)}\n`)
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

        const auth = loadAuthFile()
        auth[provider] = credentials
        saveAuthFile(auth)
        console.log(`\n${pc.green("✓")} ${provider} 登入成功（${AUTH_FILE}）`)
        return EXIT_CLEAN
      } finally {
        rl.close()
      }
    },
    catch: (error) => error
  }).pipe(
    Effect.catchCause((cause: unknown) => {
      console.error(`登入失敗：${String(cause)}`)
      return Effect.succeed(EXIT_USAGE)
    })
  )

/** 登出：移除該 provider 的 credentials。 */
export const logoutCommand = (provider: string) =>
  Effect.sync(() => {
    const auth = loadAuthFile()
    if (!auth[provider]) {
      console.error(`${provider} 本來就未登入`)
      return EXIT_CLEAN
    }
    delete auth[provider]
    saveAuthFile(auth)
    console.log(`${pc.green("✓")} 已登出 ${provider}`)
    return EXIT_CLEAN
  })

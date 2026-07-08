import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import type { OAuthCredentials } from "@earendil-works/pi-ai"
import { getOAuthApiKey } from "@earendil-works/pi-ai/oauth"
import * as Effect from "effect/Effect"

import { EngineAuthError } from "../domain/errors.ts"

/** provider → 對應的 API key 環境變數（CI 模式；OAuth-only 的 openai-codex 不列）。 */
const ENV_KEY_BY_PROVIDER: Record<string, readonly string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  groq: ["GROQ_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  xai: ["XAI_API_KEY"],
  mistral: ["MISTRAL_API_KEY"]
}

const getEnvApiKey = (provider: string): string | undefined => {
  for (const name of ENV_KEY_BY_PROVIDER[provider] ?? []) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return undefined
}

export const AUTH_DIR = path.join(os.homedir(), ".config", "reviewstuff")
export const AUTH_FILE = path.join(AUTH_DIR, "auth.json")

export type AuthFile = Record<string, OAuthCredentials>

export const loadAuthFile = (): AuthFile => {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf8")) as AuthFile
  } catch {
    return {}
  }
}

/** 原子寫入（tmp + rename），0600 權限。 */
export const saveAuthFile = (auth: AuthFile): void => {
  mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 })
  const temporary = `${AUTH_FILE}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, AUTH_FILE)
}

export const loggedInProviders = (): string[] => Object.keys(loadAuthFile())

/** 該 provider 是否有可用的 env API key（CI 模式）。 */
export const hasEnvApiKey = (provider: string): boolean => Boolean(getEnvApiKey(provider))

/**
 * 解析 provider 的 access token：
 * 1. auth.json 的訂閱 OAuth（必要時刷新並持久化）
 * 2. fallback 到環境變數 API key（CI 場景，如 OPENAI_API_KEY / ANTHROPIC_API_KEY）
 * 都沒有 → EngineAuthError。
 */
export const resolveOAuthApiKey = (
  engine: string,
  provider: string
): Effect.Effect<string, EngineAuthError> =>
  Effect.tryPromise({
    try: async () => {
      const auth = loadAuthFile()

      if (auth[provider]) {
        const resolved = await getOAuthApiKey(provider, auth)
        if (resolved) {
          auth[provider] = resolved.newCredentials
          saveAuthFile(auth)
          return resolved.apiKey
        }
        // OAuth 存在但刷新失敗——再看有沒有 env key 可退，否則報錯
      }

      const envKey = getEnvApiKey(provider)
      if (envKey) return envKey

      throw new EngineAuthError({
        engine,
        provider,
        message: auth[provider]
          ? `${provider} 的 token 無法刷新（可能已撤銷）——請重新 reviewstuff login ${provider}`
          : `尚未登入 ${provider}——跑 reviewstuff login ${provider}，或設定對應的 API key 環境變數`
      })
    },
    catch: (error) =>
      error instanceof EngineAuthError
        ? error
        : new EngineAuthError({ engine, provider, message: `token 解析失敗：${String(error)}` })
  })

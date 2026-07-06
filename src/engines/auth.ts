import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import type { OAuthCredentials } from "@earendil-works/pi-ai"
import { getOAuthApiKey } from "@earendil-works/pi-ai/oauth"
import * as Effect from "effect/Effect"

import { EngineAuthError } from "../domain/errors.ts"

export const AUTH_DIR = path.join(os.homedir(), ".config", "ai-review")
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

/**
 * 解析 provider 的 access token（必要時刷新並持久化）。
 * 未登入 / 刷新失敗 → EngineAuthError。
 */
export const resolveOAuthApiKey = (
  engine: string,
  provider: string
): Effect.Effect<string, EngineAuthError> =>
  Effect.tryPromise({
    try: async () => {
      const auth = loadAuthFile()
      if (!auth[provider]) {
        throw new EngineAuthError({
          engine,
          provider,
          message: `尚未登入 ${provider}——先跑：ai-review login ${provider}`
        })
      }
      const resolved = await getOAuthApiKey(provider, auth)
      if (!resolved) {
        throw new EngineAuthError({
          engine,
          provider,
          message: `${provider} 的 token 無法刷新（可能已撤銷）——請重新 ai-review login ${provider}`
        })
      }
      auth[provider] = resolved.newCredentials
      saveAuthFile(auth)
      return resolved.apiKey
    },
    catch: (error) =>
      error instanceof EngineAuthError
        ? error
        : new EngineAuthError({ engine, provider, message: `token 解析失敗：${String(error)}` })
  })

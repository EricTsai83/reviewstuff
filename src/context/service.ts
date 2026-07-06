import { readFileSync } from "node:fs"
import path from "node:path"

import * as Effect from "effect/Effect"

/**
 * 輕量 context 收集：專案規則檔（若存在）。
 * 引擎是 agentic 的（PiEngine 可掛工具、claude 可讀 repo），深度 context 由引擎自取。
 */
export const loadContextText = (options: {
  readonly repoRoot: string
  readonly rulesFile: string | undefined
}): Effect.Effect<string> =>
  Effect.sync(() => {
    if (!options.rulesFile) return ""
    try {
      const raw = readFileSync(path.resolve(options.repoRoot, options.rulesFile), "utf8").trim()
      return raw ? `Project review rules (${options.rulesFile}):\n${raw}` : ""
    } catch {
      return ""
    }
  })

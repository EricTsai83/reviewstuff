#!/usr/bin/env node
import { createRequire } from "node:module"

import { Command, Option } from "commander"
import * as Effect from "effect/Effect"

import { doctorCommand } from "./commands/doctor.ts"
import { loginCommand, logoutCommand } from "./commands/login.ts"
import { initCommand, reviewersCommand } from "./commands/misc.ts"
import { reviewCommand } from "./commands/review.ts"
import type { ReviewCliFlags } from "./commands/review.ts"
import { AppLive } from "./layers.ts"
import { EXIT_RUNTIME, EXIT_USAGE } from "./output/json.ts"

const require = createRequire(import.meta.url)
const pkg = require("../package.json") as { version: string }

/** 唯一的 Effect 執行點：提供 Layer、把 tagged errors 映射到 exit code。 */
const execute = <E>(effect: Effect.Effect<number, E, never>): Promise<void> =>
  Effect.runPromise(
    effect.pipe(
      Effect.catchTags({
        NotARepository: (error: { cwd: string }) =>
          Effect.sync(() => {
            console.error(`目前目錄不在 git repo 裡：${error.cwd}`)
            return EXIT_USAGE
          }),
        ConfigError: (error: { message: string }) =>
          Effect.sync(() => {
            console.error(error.message)
            return EXIT_USAGE
          }),
        GitError: (error: { message: string }) =>
          Effect.sync(() => {
            console.error(error.message)
            return EXIT_RUNTIME
          })
      } as never),
      Effect.catchCause((cause: unknown) =>
        Effect.sync(() => {
          console.error(`未預期的錯誤：${String(cause)}`)
          return EXIT_RUNTIME
        })
      )
    ) as Effect.Effect<number, never, never>
  ).then((code) => {
    process.exitCode = code
  })

const collect = (value: string, previous: string[]): string[] => [...previous, value]

const program = new Command()

program
  .name("ai-review")
  .description("Local-first, cross-model AI code review on your existing subscriptions")
  .version(pkg.version)
  .option("--staged", "只 review staged 變更")
  .option("--since <ref>", "review <ref>...HEAD 的變更（例：--since main）")
  .option("--file <glob>", "檔案過濾（可重複）", collect, [])
  .addOption(
    new Option("--profile <profile>", "quick=1 次呼叫省額度；standard=預設；thorough=全 reviewer 雙模型互審+verify").choices([
      "quick",
      "standard",
      "thorough"
    ])
  )
  .option("--reviewers <ids>", "逗號分隔的 reviewer 子集（correctness,security,typescript,architecture,performance,framework）")
  .option("--verify", "啟用 verify pass（便宜模型剔誤報）")
  .option("--no-verify", "停用 verify pass")
  .option("--update-baseline", "把這輪 findings 寫成 baseline 快照（之後的 review 會濾掉這些存量問題）")
  .option("--model <provider/model>", "整輪覆寫模型（例：openai-codex/gpt-5.5）")
  .addOption(new Option("--engine <engine>", "整輪覆寫引擎").choices(["pi", "claude", "codex"]))
  .option("--json", "stdout 輸出機器可讀 JSON（人話報告改走 stderr）")
  .option("--output <path>", "同時把 JSON 報告寫到檔案")
  .addOption(
    new Option("--fail-on <severity>", "exit code 門檻（預設 error）").choices([
      "critical",
      "error",
      "warning",
      "info",
      "none"
    ])
  )
  .option("--config <path>", "設定檔路徑（預設 ai-review.config.json）")
  .option("--timeout <seconds>", "單一 reviewer 逾時秒數", (value) => Number.parseInt(value, 10))
  .option("--concurrency <n>", "平行 reviewer 數", (value) => Number.parseInt(value, 10))
  .action(async (options) => {
    const flags: ReviewCliFlags = {
      staged: options.staged,
      since: options.since,
      file: options.file.length > 0 ? options.file : undefined,
      profile: options.profile,
      reviewers: options.reviewers,
      model: options.model,
      engine: options.engine,
      verify: options.verify,
      updateBaseline: options.updateBaseline,
      json: options.json,
      output: options.output,
      failOn: options.failOn,
      config: options.config,
      timeout: options.timeout,
      concurrency: options.concurrency
    }
    await execute(reviewCommand(flags).pipe(Effect.provide(AppLive)))
  })

program
  .command("doctor")
  .description("檢查 git repo 與引擎登入狀態")
  .action(async () => {
    await execute(doctorCommand().pipe(Effect.provide(AppLive)))
  })

program
  .command("login")
  .description("訂閱 OAuth 登入（openai-codex / anthropic / github-copilot…）")
  .argument("<provider>", "provider id")
  .action(async (provider: string) => {
    await execute(loginCommand(provider))
  })

program
  .command("logout")
  .description("移除某 provider 的 credentials")
  .argument("<provider>", "provider id")
  .action(async (provider: string) => {
    await execute(logoutCommand(provider))
  })

program
  .command("init")
  .description("在目前目錄產生 ai-review.config.json")
  .action(async () => {
    await execute(initCommand())
  })

program
  .command("reviewers")
  .description("列出 reviewer 配置與登入狀態")
  .option("--config <path>", "設定檔路徑")
  .action(async (options: { config?: string }) => {
    await execute(reviewersCommand(options.config))
  })

program.parseAsync(process.argv)

# ReviewStuff Implementation Plans

這個 repo 目前刻意只保留 plans。請從 001 開始照順序實作；每一份 plan 做完後，專案都必須維持可執行、可測試、可繼續往下一步開發。

## 原則

- 每個階段只做該 plan 的 scope，不提前做後續功能。
- `commands/` 保持薄，核心流程放在 `use-cases/` 或 service。
- 所有 schema 要 versioned；所有檔案寫入要 atomic。
- 外部 command 必須有 timeout、output limit、exit-code mapping。
- 預設 review 要快且可預測；慢的 deep review 必須 opt-in。
- TypeScript 是實作語言，不是 review 能力邊界。
- Release 的 source of truth 是 standalone binary；npm/Homebrew 只是安裝通道。

## 順序

| Order | Plan | Working State |
| --- | --- | --- |
| 001 | [Project Bootstrap And Bun CLI](./001-project-bootstrap-and-bun-cli.md) | 最小 Bun standalone CLI 可 build/run |
| 002 | [Binary Test Harness](./002-binary-test-harness.md) | 測試直接跑 compiled binary |
| 003 | [Local Install Workflow](./003-local-install-workflow.md) | 本機 `reviewstuff` 指令可用 |
| 004 | [Repository Structure Boundaries](./004-repository-structure-boundaries.md) | module 邊界固定 |
| 005 | [Git Diff Review MVP](./005-git-diff-review-mvp.md) | 可 review git diff 並輸出 deterministic report |
| 006 | [Config Profiles And Prompts](./006-config-profiles-and-prompts.md) | 可用 config/profile/reviewer prompts 控制 review |
| 007 | [Engine Adapters MVP](./007-engine-adapters-mvp.md) | fake engine 穩定，provider adapters 有清楚邊界 |
| 008 | [Review Session Storage](./008-review-session-storage.md) | review 結果可保存並載入 |
| 009 | [Findings And Prompt Replay](./009-findings-and-prompt-replay.md) | 可查 findings、重播修復 prompt |
| 010 | [Fix Iteration Workflow](./010-fix-iteration-workflow.md) | 可 dry-run/apply 修復並驗證 |
| 011 | [Agent JSON Protocol](./011-agent-json-protocol.md) | `--agent` 輸出 NDJSON |
| 012 | [Doctor And Supportability](./012-doctor-and-supportability.md) | 可診斷本機環境 |
| 013 | [Language Agnostic Review Core](./013-language-agnostic-review-core.md) | review schema 不綁 TypeScript |
| 014 | [External Analyzer Adapters](./014-external-analyzer-adapters.md) | 可接入 TypeScript/Python/Go/Rust 工具 |
| 015 | [Agentic Deep Review](./015-agentic-deep-review.md) | opt-in deep review agent 可用 |
| 016 | [Release Artifact Layout](./016-release-artifact-layout.md) | 可產生 release tarball/checksum/manifest |
| 017 | [macOS Signing And Homebrew](./017-macos-signing-and-homebrew.md) | macOS 發佈與 Homebrew 安裝路徑可用 |
| 018 | [NPM Multi Platform And Update](./018-npm-multi-platform-and-update.md) | npm/multi-platform/update policy 有落地路徑 |

## 每個 plan 完成前檢查

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `./dist/reviewstuff --version`
- `./dist/reviewstuff --help`
- 該 plan 自己列出的驗收指令


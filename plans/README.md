# ReviewStuff Plan Index

這個資料夾把 ReviewStuff 的工作拆成小型、可獨立執行的 plans。每份 plan 都應該可以單獨交給另一個 engineer/agent 實作，不需要重新做產品判斷。

## 執行原則

- 依序執行，除非某份 plan 明確標記可平行。
- 每份 plan 完成後都要跑它列出的驗收指令。
- 每份 plan 只做它的 scope，不順手做下一階段。
- Production 相關能力分階段加入；不要在 MVP 包入 Homebrew、codesign、auto-update。
- 任何會改 source file 的工作都必須保留現有測試與 fake engine workflow。
- TypeScript 是 implementation language，不是 review domain boundary；review core 必須能支援非 TypeScript 專案。
- 正式 release 的 source of truth 是 compiled standalone binary；npm、Homebrew、install script 都只是安裝管道，不應各自產生不同 runtime artifact。
- 外部語言工具必須透過 adapters 接入；core schema 不可綁定 `tsc`、ESLint、Vitest 或 Node 專案假設。

## Plans

| Order | Plan | Goal | Depends on |
| --- | --- | --- | --- |
| 001 | [Bun Standalone MVP](./001-bun-standalone-mvp.md) | 產生可直接執行的 macOS arm64 binary | none |
| 002 | [Binary Test Harness](./002-binary-test-harness.md) | 讓 e2e 測試跑 compiled binary | 001 |
| 003 | [Local Install Workflow](./003-local-install-workflow.md) | 本機 symlink 安裝到 PATH | 001 |
| 004 | [Review Session Storage](./004-review-session-storage.md) | 保存 review session/findings/diff | 001 |
| 005 | [Findings And Prompt Replay](./005-findings-and-prompt-replay.md) | 不重跑模型即可查看 findings/prompts | 004 |
| 006 | [Fix Iteration Workflow](./006-fix-iteration-workflow.md) | 從 stored findings 產生/驗證/套用修復 | 004, 005 |
| 007 | [Agent JSON Protocol](./007-agent-json-protocol.md) | 提供 agent-friendly NDJSON output | 004 |
| 008 | [Release Artifact Layout](./008-release-artifact-layout.md) | 定義 release tarball/checksum/layout | 001, 002 |
| 009 | [Codesign And Notarization](./009-codesign-notarization.md) | macOS production 必要簽章流程 | 008 |
| 010 | [Homebrew Distribution](./010-homebrew-distribution.md) | Homebrew 安裝路徑 | 008, 009 |
| 011 | [Auto Update Policy](./011-auto-update-policy.md) | binary 自我更新策略 | 008 |
| 012 | [Multi Platform Builds](./012-multi-platform-builds.md) | Linux/Windows/Intel macOS 擴展 | 008 |
| 013 | [Doctor And Supportability](./013-doctor-and-supportability.md) | production 診斷與支援資訊 | 001, 004 |
| 014 | [NPM Binary Wrapper](./014-npm-binary-wrapper.md) | 讓 npm/pnpm/yarn 成為 binary 安裝通道 | 008 |
| 015 | [Language Agnostic Review Core](./015-language-agnostic-review-core.md) | 讓 review core 不綁定 TypeScript | 004, 007 |
| 016 | [External Analyzer Adapters](./016-external-analyzer-adapters.md) | 接入 TypeScript/Python/Go/Rust 等語言工具 | 015 |

## 建議里程碑

### Milestone 1: Local Binary

- 001
- 002
- 003

結果：可以用 `./dist/reviewstuff` 或 `reviewstuff` 在本機跑 CLI。

### Milestone 2: Review/Fix Iteration

- 004
- 005
- 006
- 007

結果：可以在 push 前做本地 review，保存 findings，重播 prompts，並在 review/fix 之間迭代。

### Milestone 3: Production Distribution

- 008
- 009
- 010
- 011
- 013
- 014

結果：可以開始穩定分發給其他 macOS arm64 使用者。

### Milestone 4: Multi-Language Review

- 015
- 016

結果：ReviewStuff 的 core review/fix/session protocol 不再假設專案是 TypeScript，後續可以逐步加入 Python、Go、Rust、Java 等 adapters。

### Milestone 5: Platform Expansion

- 012

結果：支援更多平台。

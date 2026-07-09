# ReviewStuff Plan Index

這個資料夾把 ReviewStuff 的工作拆成小型、可獨立執行的 plans。每份 plan 都應該可以單獨交給另一個 engineer/agent 實作，不需要重新做產品判斷。

每個 plan 的要求是：做完後系統仍然要能運作，不能只留下半套架構。功能可以小，但狀態必須穩。

## 執行原則

- 依序執行，除非某份 plan 明確標記可平行。
- 每份 plan 完成後都要跑它列出的驗收指令。
- 每份 plan 只做它的 scope，不順手做下一階段。
- Production 相關能力分階段加入；不要在 MVP 包入 Homebrew、codesign、auto-update。
- 任何會改 source file 的工作都必須保留現有測試與 fake engine workflow。
- TypeScript 是 implementation language，不是 review domain boundary；review core 必須能支援非 TypeScript 專案。
- 正式 release 的 source of truth 是 compiled standalone binary；npm、Homebrew、install script 都只是安裝管道，不應各自產生不同 runtime artifact。
- 外部語言工具必須透過 adapters 接入；core schema 不可綁定 `tsc`、ESLint、Vitest 或 Node 專案假設。
- Agentic review 可以作為 opt-in deep mode，但預設 pre-push review 必須維持快速、可預測、可重現。
- Deep review 的 agent 必須輸出 ReviewStuff structured findings；不能只產生自然語言 comment。

## 品質原則

- **Robustness**: 所有本機檔案寫入要 atomic；所有 repo path 要限制在 repo root；所有外部 command 要有 timeout 和錯誤分類。
- **Performance**: 預設 review 要快且可預測；慢的深度分析必須 opt-in；工具輸出、token、檔案大小、並行度都要有上限。
- **Maintainability**: CLI entrypoint 保持薄；核心能力拆成 service/use-case；schema 要 versioned；測試要覆蓋 fake engine 和 compiled binary。
- **Compatibility**: 每階段都保留既有 CLI contract；新增功能不能破壞 `--help`、`--version`、fake-engine e2e。
- **Language Neutrality**: TypeScript 是實作語言，不是 review 能力邊界。

## 實作檢查清單

每份 plan 完成前都要檢查：

- CLI command 是否只做 parsing/rendering，核心邏輯是否在 service/use-case。
- 新增 schema 是否有 `version`，且能向後讀取或安全拒絕舊資料。
- 檔案寫入是否 temp file + rename，路徑是否限制在 repo root。
- 外部 command 是否有 timeout、stdout/stderr size limit、exit code mapping。
- 長任務是否有 bounded concurrency，並且不阻塞基本 review path。
- 新增 output 是否有 human mode 和 machine-readable mode 的邊界。
- 新增功能是否有 fake-engine 測試或 fixture 測試。
- `pnpm typecheck`、`pnpm test`、compiled binary smoke test 是否仍通過。

## 嚴格執行順序

下面順序是建議的主線。可以平行研究，但 merge/落地時應照順序，避免後面功能建立在不穩的基礎上。

| Order | Plan | Purpose | Working State After Completion |
| --- | --- | --- | --- |
| 001 | [Bun Standalone MVP](./001-bun-standalone-mvp.md) | 先把 runtime artifact 變成 standalone binary | `./dist/reviewstuff --help` 和 `--version` 可直接跑，不需要 Node/Bun runtime |
| 002 | [Binary Test Harness](./002-binary-test-harness.md) | 讓測試真正驗 compiled binary | e2e 測試直接跑 `dist/reviewstuff`，避免 Node build 和 binary build 行為分裂 |
| 003 | [Local Install Workflow](./003-local-install-workflow.md) | 讓本機開發者能用 terminal command | `reviewstuff --help` 可從 PATH 執行，適合日常 pre-push 使用 |
| 004 | [Repository Structure Boundaries](./004-repository-structure-boundaries.md) | 先固定 module 邊界，避免 commands 變胖 | CLI 行為不變，但 review 主流程開始移到 `use-cases/` |
| 005 | [Review Session Storage](./005-review-session-storage.md) | 保存 review 結果，支撐後續迭代 | 每次 review 會產生 repo-local session，可查 latest，可保存 diff/findings |
| 006 | [Findings And Prompt Replay](./006-findings-and-prompt-replay.md) | 不重跑模型也能看 findings/prompts | `reviewstuff findings` 和 `reviewstuff prompts` 可操作上一輪 review |
| 007 | [Fix Iteration Workflow](./007-fix-iteration-workflow.md) | 從 findings 進入修復迭代 | `reviewstuff fix --dry-run` 可產生修復方案，`--apply` 在驗證後套用 |
| 008 | [Agent JSON Protocol](./008-agent-json-protocol.md) | 讓其他 agent/CI 能穩定解析 CLI | `--agent` 輸出合法 NDJSON，human logs 不污染 stdout |
| 009 | [Release Artifact Layout](./009-release-artifact-layout.md) | 定義正式 binary artifact | 可產生 tarball、checksum、manifest，使用者可手動下載執行 |
| 010 | [Codesign And Notarization](./010-codesign-notarization.md) | 讓 macOS release 可被信任執行 | release binary 可通過 codesign/notarization；local unsigned build 不受影響 |
| 011 | [Homebrew Distribution](./011-homebrew-distribution.md) | 提供 macOS 安裝通道 | `brew install` 可安裝同一份 release binary |
| 012 | [Auto Update Policy](./012-auto-update-policy.md) | 提供 direct-install 的更新策略 | `reviewstuff update --check` 可辨識 direct/Homebrew/local install 並安全處理 |
| 013 | [Multi Platform Builds](./013-multi-platform-builds.md) | 擴展到更多 OS/CPU | release manifest 可描述多平台 binary；每個 target 有 smoke test |
| 014 | [Doctor And Supportability](./014-doctor-and-supportability.md) | 提供診斷與支援資訊 | `reviewstuff doctor` 可檢查 runtime、git、storage、provider、language tools |
| 015 | [NPM Binary Wrapper](./015-npm-binary-wrapper.md) | 讓 npm/pnpm/yarn 成為安裝通道 | `npm install -g reviewstuff` 執行同一份 standalone binary |
| 016 | [Language Agnostic Review Core](./016-language-agnostic-review-core.md) | 讓 review schema 不綁 TypeScript | TS 與非 TS 檔案都能被同一套 schema/session 表示 |
| 017 | [External Analyzer Adapters](./017-external-analyzer-adapters.md) | 接入各語言既有工具 | TS/Python/Go/Rust analyzers 可選擇性提供 diagnostics；缺工具不會中斷 review |
| 018 | [Agentic Deep Review](./018-agentic-deep-review.md) | 引入 opt-in deep review agent | `reviewstuff review --deep` 可用 bounded tools 深度檢查並輸出 structured findings |

## 建議里程碑

### Milestone 1: Local Binary

- 001
- 002
- 003
- 004

結果：可以用 `./dist/reviewstuff` 或 `reviewstuff` 在本機跑 CLI，e2e 測試覆蓋 compiled binary，且後續功能有清楚 module 邊界。

### Milestone 2: Review/Fix Iteration

- 005
- 006
- 007
- 008

結果：可以在 push 前做本地 review，保存 findings，重播 prompts，並在 review/fix 之間迭代。

### Milestone 3: Release And Distribution

- 009
- 010
- 011
- 012
- 013
- 014
- 015

結果：可以開始穩定分發給其他使用者；GitHub Release 是 source of truth，Homebrew/npm 只是安裝通道。

### Milestone 4: Multi-Language Review

- 016
- 017

結果：ReviewStuff 的 core review/fix/session protocol 不再假設專案是 TypeScript，後續可以逐步加入 Python、Go、Rust、Java 等 adapters。

### Milestone 5: Agentic Deep Review

- 018

結果：可用 `reviewstuff review --deep` 做較慢但更完整的本機 deep review，agent 可以讀相關檔案、搜尋 repo、跑受控 analyzers、載入 skills，但最後仍保存 structured findings。

# ReviewStuff Implementation Plans

這個 repo 目前刻意只保留 plans。請從 001 開始照順序實作；每一份 plan 做完後，專案都必須維持可執行、可測試、可繼續往下一步開發。

## 原則

- 每個階段只做該 plan 的 scope，不提前做後續功能。
- 每個 plan 只引入一個主要新概念；如果同時需要新 schema、新 command、新 storage、新外部 integration，必須切小。
- `commands/` 保持薄，核心流程放在 `use-cases/` 或 service。
- 所有 schema 要 versioned；所有檔案寫入要 atomic。
- 外部 command 必須有 timeout、output limit、exit-code mapping。
- 預設 review 要快且可預測；慢的 deep review 必須 opt-in。
- TypeScript 是實作語言，不是 review 能力邊界。
- Repo package management 使用 Bun；開發指令一律用 `bun install` / `bun run ...`。
- Release 的 source of truth 是 standalone binary；npm/Homebrew 只是安裝通道。

## Long-Term Architecture

長期方向是 thin CLI + Effect application core + controlled platform layer：

- CLI command 只解析 flags、呼叫 use-case、render output。
- Use-case 編排流程，但不直接碰 subprocess、filesystem、provider SDK。
- Domain 放 versioned schema、純型別、純規則。
- Platform layer 集中副作用，尤其是 command execution、filesystem、clock、environment。
- Git、analyzer、engine、storage 都是 service boundary，透過 Effect dependency 注入。
- 測試優先測純 domain/use-case；需要驗證 CLI 行為時才跑 compiled binary。

Effect 的採用節奏要保守：先建立 runtime entrypoint 和必要 service interface，等功能真的需要 timeout/concurrency/error mapping 時再加 Layer 組合。不要為尚未出現的需求提前建立抽象。

## Tech Stack

- Runtime/package manager/build target: Bun。
- Language: TypeScript strict mode。
- CLI parsing/help: `commander`。
- Application runtime: `effect`；use-cases、services、error mapping、timeouts、concurrency 使用 Effect 表達。
- Platform abstraction: `@effect/platform` + `@effect/platform-bun`。
- External processes: 一律經由 `@effect/platform/Command`，不得直接在 feature code 使用 `child_process`、`Bun.spawn` 或 shell string。
- Runtime validation: 使用 Effect schema API；所有 persisted/public schema 都要 versioned。
- Test runner: Bun test，透過 `bun run test` 執行。

## Plan Sizing Checklist

每個 plan 開始前先確認：

- 是否能在 1-2 個 focused sessions 內完成。
- 是否有單一主要學習主題。
- 是否能用 fake/deterministic dependency 驗證。
- 是否保留 working binary。
- 是否避免同時新增多個外部 integration。
- 是否有清楚的「不包含」項目。

## Product Completeness

完成 001-019 後，目標狀態是可以本機使用的 AI code review MVP，不是完整商用品質 release。

已具備：

- 可 build 成 Bun standalone binary。
- 有 binary e2e tests、本機 symlink 安裝、Homebrew formula、npm darwin-arm64 wrapper。
- 可用真實 AI provider review staged git diff，產生 structured findings/report。
- fake engine 仍可做 deterministic tests。
- 有 config/profile、session storage、findings 查詢、prompt replay、fix dry-run、NDJSON agent output。
- 有 TypeScript/Python/unknown 的 language-neutral schema。
- 有第一個 TypeScript analyzer adapter。
- 有最小 readonly deep review loop。

尚未具備：

- `--since <ref>`、完整 working tree scope。
- `fix --apply`。
- Python/Go/Rust analyzers、Semgrep、LSP 或 Tree-sitter。
- deep review 的 `runAnalyzer`、`runGate`、progressive skills。
- macOS codesign/notarization。
- Linux/macOS x64 npm packages。
- update command/self-update。
- CI release automation、telemetry/privacy policy、完整產品文件。

因此 019 之後可以真的拿本機 codebase 做 staged diff AI review，並作為 dogfood/internal beta 使用；若要稱為完整產品，應再追加 post-019 hardening/release plans。

## 順序

| Order | Plan | Working State |
| --- | --- | --- |
| 001 | [Project Bootstrap And Bun CLI](./001-project-bootstrap-and-bun-cli.md) | 最小 Bun standalone CLI 可 build/run |
| 002 | [Binary Test Harness](./002-binary-test-harness.md) | 測試直接跑 compiled binary |
| 003 | [Local Install Workflow](./003-local-install-workflow.md) | 本機 `reviewstuff` 指令可用 |
| 004 | [Repository Structure Boundaries](./004-repository-structure-boundaries.md) | module 邊界固定 |
| 005 | [Git Diff Review MVP](./005-git-diff-review-mvp.md) | 可 review git diff 並輸出 deterministic report |
| 006 | [Config Profiles](./006-config-profiles-and-prompts.md) | 可用 config/profile 控制 review |
| 007 | [Engine Adapters MVP](./007-engine-adapters-mvp.md) | fake engine 穩定，provider adapters 有清楚邊界 |
| 008 | [Real AI Review Provider](./008-real-ai-review-provider.md) | 可用真實 provider review staged diff |
| 009 | [Review Session Storage](./009-review-session-storage.md) | review 結果可保存並載入 |
| 010 | [Findings And Prompt Replay](./010-findings-and-prompt-replay.md) | 可查 findings、重播修復 prompt |
| 011 | [Fix Iteration Workflow](./011-fix-iteration-workflow.md) | 可 dry-run 修復候選並驗證 |
| 012 | [Agent JSON Protocol](./012-agent-json-protocol.md) | `--agent` 輸出 NDJSON |
| 013 | [Doctor And Supportability](./013-doctor-and-supportability.md) | 可診斷本機環境 |
| 014 | [Language Agnostic Review Core](./014-language-agnostic-review-core.md) | review schema 不綁 TypeScript |
| 015 | [External Analyzer Adapters](./015-external-analyzer-adapters.md) | 可接入第一個 TypeScript analyzer |
| 016 | [Agentic Deep Review](./016-agentic-deep-review.md) | opt-in deep review agent 可用 |
| 017 | [Release Artifact Layout](./017-release-artifact-layout.md) | 可產生 release tarball/checksum/manifest |
| 018 | [Homebrew Install Path](./018-homebrew-install-path.md) | Homebrew 安裝路徑可用 |
| 019 | [NPM First Platform Package](./019-npm-first-platform-package.md) | npm 單平台安裝通道有落地路徑 |

## 每個 plan 完成前檢查

- `bun run typecheck`
- `bun run test`
- `bun run build`
- `./dist/reviewstuff --version`
- `./dist/reviewstuff --help`
- 該 plan 自己列出的驗收指令

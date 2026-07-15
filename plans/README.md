# ReviewStuff Implementation Plans

這個 repo 目前刻意只保留 plans。請從 001 開始照順序實作；每一份 plan 做完後，專案都必須維持可執行、可測試、可繼續往下一步開發。

## 原則

- 每個階段只做該 plan 的 scope，不提前做後續功能。
- 每個 plan 只引入一個主要新概念；如果同時需要新 schema、新 command、新 storage、新外部 integration，必須切小。
- 若某個 plan 已經包含兩個以上主要概念，直接拆成下一個連續編號，不為了維持原始數量而把 scope 塞在一起。
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
- Platform layer 集中低階副作用，尤其是 command execution、filesystem、clock、environment。
- Git、analyzer、engine、storage 都是 semantic service boundary，透過 Effect dependency
  注入；只有它們的 concrete implementation 可以依賴 platform，use-case 不直接取得低階 service。
- 單一 canonical implementation 與 service contract 留在同一個 capability module；
  只有多個真實 production implementations 時才拆具名 adapters。`Live` 保留給
  `AppLive` 這類完整 production graph，不建立 generic `live.ts`。
- 測試優先測純 domain/use-case；需要驗證 CLI 行為時才跑 compiled binary。

Effect 的採用節奏要保守：先建立 runtime entrypoint 和必要 service interface，等功能真的需要 timeout/concurrency/error mapping 時再加 Layer 組合。不要為尚未出現的需求提前建立抽象。

## Service Map

主要 service boundary 必須一路維持清楚：

- `commands`: CLI flags、usage errors、stdout/stderr rendering。
- `use-cases`: review、fix、doctor、stats、update 等 application flow。
- `domain`: versioned schemas、finding/report/scope/config rules，不碰 IO。
- `platform`: filesystem、command runner、clock、environment、network wrapper；不包含
  Git/provider/storage 等 feature semantics。
- `git`: repo detection、diff/scope、file metadata，只透過 platform command runner 執行 git。
- `engines`: fake/cloud/local CLI providers，接收 normalized request，不直接讀 repo。
- `storage`: sessions、findings、prompts、fix attempts、stats cache，所有寫入 atomic。
- `output`: human renderer、JSON renderer、NDJSON agent events。
- `languages` / `analyzers`: language detection、optional external tool diagnostics。
- `fix`: fix candidate schema、temp worktree validation、apply transaction。
- `agent`: bounded deep-review loop、tool registry、budget/path/output guardrails。
- `release`: package artifacts、install channel detection、update manifest、signing hooks。

任何新功能若需要跨三個以上 service boundary，先確認是否應拆成多個 plan。

## CLI Review UX

參考 CodeRabbit CLI 的 local-review UX，但保留本專案的 provider-agnostic/local-first 設計：

- `reviewstuff review` 是主入口，預設 review 目前 local changes，不要求 `git add`。
- no changes 時不呼叫 provider；human mode 印出 no-change message，agent mode 輸出 `review_skipped` event。
- `--agent` 輸出 structured JSON/NDJSON，事件至少包含 `review_context`、`status`、`finding`、`heartbeat`、`complete`、`error`，給 coding agents 自動修復迭代使用。
- `--fast` / `--light` 提供較快、較便宜的 local development review policy；`--fast` 是使用者面向名稱，`--light` 保留作為清楚語義 alias。
- `--base <branch>` / `--base-commit <commit>` / `--since <ref>` 提供 branch comparison。
- `--type all|committed|uncommitted` 和 `--dir <path>` 對齊 agent/CI 常見呼叫方式。
- path filters 預設略過 lock files、generated files、build outputs、binary/media files；使用者可 override。
- `fix --dry-run` 和 `fix --apply` 是獨立命令；`review` 本身不改 source files。

## CLI Contract

- Human mode 可以使用 stdout/stderr 做可讀輸出；agent/JSON mode 的 stdout 必須只輸出 machine-readable data。
- `--json` 輸出單一 JSON document；`--agent` 輸出 NDJSON stream。
- Diagnostics、progress、warnings 在 machine-readable mode 走 stderr 或 structured event，不污染 stdout。
- Exit code policy 要穩定：`0` 成功或無變更、usage/config error 用固定非零碼、provider/tool/runtime failure 可區分。
- Ctrl-C / SIGINT 要停止長任務並清理 heartbeat、temp worktree、partial writes。

## Tech Stack

- Runtime/package manager/build target: Bun。
- Language: TypeScript strict mode。
- CLI parsing/help: `@effect/cli`。
- Application runtime: `effect`；use-cases、services、error mapping、timeouts、concurrency 使用 Effect 表達。
- Platform abstraction: `@effect/platform` + `@effect/platform-bun`。
- External processes: 一律經由 `@effect/platform/Command`，不得直接在 feature code 使用 `child_process`、`Bun.spawn` 或 shell string。
- Runtime validation: 使用 Effect schema API；所有 persisted/public schema 都要 versioned。
- Test runner: Bun test，透過 `bun run test` 執行。

## Runtime And Platform Decision

後續執行 plan 時，預設採用 Bun-first + Effect platform 的設計：

- Bun 是 package manager、script runner、test runner、build target 和 standalone binary runtime。
- Effect 是 application runtime；跨 use-case 的 error、dependency injection、timeout、concurrency、resource cleanup 都用 Effect 表達。
- Filesystem、path、command、environment、clock、network 等副作用優先走 `@effect/platform` service，並在 Bun entrypoint / tests 透過 `@effect/platform-bun` 提供 layer。
- CLI entrypoint 使用 `Bun.argv`、`Bun.env`、`import.meta.dir`、`import.meta.path` 等 Bun/runtime 原生能力。
- Feature code 不直接 import `node:*`，也不直接使用 `process.argv`、`process.env`、`child_process`、`Bun.spawn` 或 shell string。
- 若 Bun 或 Effect platform 沒有足夠 API，才可以在 platform adapter 的最小範圍使用 runtime-compatible escape hatch；使用前要在該 plan 或 PR 說明原因，不能散落在 use-case/domain/feature code。
- 測試同樣遵守這個邊界：用 Bun test，副作用測試優先透過 `@effect/platform` fake/service 或 BunContext，不為方便直接改回 Node stdlib。

判斷標準：如果一段程式碼看起來像 Node 腳本，通常就需要重新檢查是否應改成 Bun entrypoint、Effect service，或收斂到 platform adapter。

## Test And Fake Strategy

- Unit tests 優先測 domain rules、schema parsing、config precedence、scope selection、error mapping。
- Use-case tests 使用 fake semantic services：fake engine、fake git service、fake storage、
  fake clock。Adapter tests 才注入 fake command runner、filesystem 或 network service。
- Binary e2e tests 只測 CLI contract、exit code、stdout/stderr、compiled binary integration。
- Fixture repos 用來測 git diff、language detection、analyzer output、provider request building。
- Fake engine 必須 deterministic，並能產生：no findings、single finding、invalid output、provider failure、fix candidate。
- External tools 和 provider integration tests 是 smoke tests，不應成為一般 `bun run test` 的必要條件。
- 每個 public/persisted schema 都要有 fixture snapshot；schema 變更要新增版本或 migration test。

## Schema And Compatibility Policy

- Public output、agent events、config、session storage、release manifest、stats cache 都是 versioned schema。
- 新欄位預設 additive；破壞性變更要新增 schema version。
- 讀取 persisted data 時要支援目前版本和上一個版本，或提供明確 migration/refusal message。
- Production readiness 必須檢查舊 session、舊 config、舊 release manifest 是否仍可被讀取或有清楚升級路徑。

## Data And Privacy Baseline

- 預設不啟用 telemetry；local stats 只讀本機 session。
- Cloud provider request 必須可被使用者理解：request metadata、provider/model、scope、included/skipped files 都要可追蹤。
- Full redaction、privacy modes、`.reviewstuffignore`、request preview 和 data retention policy 在 029 完成；029 之前的 real-provider plans 必須在 docs/doctor 中清楚標示資料會送到所選 provider。
- Session storage 要能被安全清理；任何保存 prompt/request 的地方都必須走 redaction policy。

## Plan Sizing Checklist

每個 plan 開始前先確認：

- 是否能在 1-2 個 focused sessions 內完成。
- 是否有單一主要學習主題。
- 是否能用 fake/deterministic dependency 驗證。
- 是否保留 working binary。
- 是否避免同時新增多個外部 integration。
- 是否有清楚的「不包含」項目。

## Scope Refinement Notes

這份 plan set 已把容易過大的階段排成連續編號：

- 008 只做第一個 real provider；009 才加入 additional provider adapters。
- 011 只做 findings/prompt replay；012 才做 local stats。
- 022 只做 diff scope selection；023 才做 file filters 和 skip policy。
- 025 只做 Python analyzers；026 才做 Go/Rust/Semgrep。
- 030 只做 CI gate；031 才做 release automation。
- 033 只做 multi-platform package 和 update check；034 才做 direct tarball self-update。

後續若發現某個階段仍然太大，不新增字母編號；直接插入下一個連續編號並同步更新這份順序表。

## Learning Path

每個 plan 不只是交付功能，也要讓實作者理解一個架構概念：

- 001-004：CLI executable、compiled binary test、local install、module boundary。
- 005-007：Git input selection、domain schema、engine adapter boundary。
- 008-015：real provider contract、provider registry、storage、read-only replay、local stats、safe fix dry-run、agent protocol、supportability。
- 016-018：language-neutral core、external analyzer adapter、bounded readonly agent。
- 019-024：release artifact model、install channels、review scope UX、file filtering、safe apply workflow。
- 025-029：multi-language tool signal、deep-review tools、provider reliability、privacy/security governance。
- 030-037：CI/release automation、signing、update、documentation、large patch budgeting、production readiness。

如果某個 plan 做完後只學到「把很多東西接起來」，通常代表 scope 太大，應拆成下一個連續編號。

## Product Completeness

完成 001-021 後，目標狀態是可以本機使用的 AI code review MVP，不是完整商用品質 release。完成 001-037 後，目標狀態才是 production-ready CLI。

001-021 已具備：

- 可 build 成 Bun standalone binary。
- 有 binary e2e tests、本機 symlink 安裝、Homebrew formula、npm darwin-arm64 wrapper。
- 可用真實 AI provider review current working tree / branch diff，產生 structured findings/report。
- provider/model 可切換：cloud API provider、本機 CLI provider、不同模型字串都走同一個 engine contract。
- fake engine 仍可做 deterministic tests。
- 有 config/profile、session storage、findings 查詢、prompt replay、fix dry-run、NDJSON agent output。
- 有 TypeScript/Python/unknown 的 language-neutral schema。
- 有第一個 TypeScript analyzer adapter。
- 有最小 readonly deep review loop。

022-037 補齊 production-ready 所需能力：

- `--dir`、`--type`、`--base-commit`、`--since <ref>`、current branch vs base 的完整 scope。
- `fix --apply`。
- Python/Go/Rust analyzers、Semgrep、LSP 或 Tree-sitter。
- deep review 的 `runAnalyzer`、`runGate`、progressive skills。
- macOS codesign/notarization。
- Linux/macOS x64 npm packages。
- update command/self-update。
- CI release automation、telemetry/privacy policy、完整產品文件。
- provider reliability/cost controls。
- 大型 patch 的 budgeted hunk selection 與可觀察 review coverage。
- privacy/security data policy。
- final production readiness gate。

因此 021 之後可以真的拿本機 codebase 做 local changes AI review，並作為 dogfood/internal beta 使用；037 之後才應標記 production-ready release。

## 順序

每完成一個 plan 後，必須回到這張表把對應列的 `Status` 從 `[ ] TODO` 改成 `[x] DONE`。只有在該 plan 的 verification commands 跑完、acceptance criteria 都符合、且專案仍可繼續往下一個 plan 開發時，才能標註 DONE。

| Status | Order | Plan | Working State |
| --- | --- | --- | --- |
| [x] DONE | 001 | [Project Bootstrap And Bun CLI](./001-project-bootstrap-and-bun-cli.md) | 最小 Bun standalone CLI 可 build/run |
| [x] DONE | 002 | [Binary Test Harness](./002-binary-test-harness.md) | 測試直接跑 compiled binary |
| [x] DONE | 003 | [Local CLI Workflow](./003-local-cli-workflow.md) | 可直接執行本機 compiled binary |
| [x] DONE | 004 | [Repository Structure Boundaries](./004-repository-structure-boundaries.md) | module 邊界固定 |
| [ ] TODO | 005 | [Git Diff Review MVP](./005-git-diff-review-mvp.md) | 可 review git diff 並輸出 deterministic report |
| [ ] TODO | 006 | [Config Profiles](./006-config-profiles-and-prompts.md) | 可用 config/profile 控制 review |
| [ ] TODO | 007 | [Engine Adapters MVP](./007-engine-adapters-mvp.md) | deterministic engine 穩定，provider adapters 有清楚邊界 |
| [ ] TODO | 008 | [Real AI Review Provider](./008-real-ai-review-provider.md) | 第一個真實 cloud provider 可 review local changes |
| [ ] TODO | 009 | [Additional Provider Adapters](./009-additional-provider-adapters.md) | Anthropic 與 local CLI provider 接上同一 contract |
| [ ] TODO | 010 | [Review Session Storage](./010-review-session-storage.md) | review 結果可保存並載入 |
| [ ] TODO | 011 | [Findings And Prompt Replay](./011-findings-and-prompt-replay.md) | 可查 findings、重播修復 prompt |
| [ ] TODO | 012 | [Review Stats](./012-review-stats.md) | 可從 local sessions 彙整 review statistics |
| [ ] TODO | 013 | [Fix Iteration Workflow](./013-fix-iteration-workflow.md) | 可 dry-run 修復候選並驗證 |
| [ ] TODO | 014 | [Agent JSON Protocol](./014-agent-json-protocol.md) | `--agent` 輸出 NDJSON |
| [ ] TODO | 015 | [Doctor And Supportability](./015-doctor-and-supportability.md) | 可診斷本機環境 |
| [ ] TODO | 016 | [Language Agnostic Review Core](./016-language-agnostic-review-core.md) | review schema 不綁 TypeScript |
| [ ] TODO | 017 | [External Analyzer Adapters](./017-external-analyzer-adapters.md) | 可接入第一個 TypeScript analyzer |
| [ ] TODO | 018 | [Agentic Deep Review](./018-agentic-deep-review.md) | opt-in deep review agent 可用 |
| [ ] TODO | 019 | [Release Artifact Layout](./019-release-artifact-layout.md) | 可產生 release tarball/checksum/manifest |
| [ ] TODO | 020 | [Homebrew Install Path](./020-homebrew-install-path.md) | Homebrew 安裝路徑可用 |
| [ ] TODO | 021 | [NPM First Platform Package](./021-npm-first-platform-package.md) | npm 單平台安裝通道有落地路徑 |
| [ ] TODO | 022 | [Review Scopes](./022-review-scopes.md) | 常用 diff scope 可用 |
| [ ] TODO | 023 | [Review Filters And Skip Policy](./023-review-filters-and-skip-policy.md) | path filters 與 skip reasons 可用 |
| [ ] TODO | 024 | [Fix Apply Workflow](./024-fix-apply-workflow.md) | 可安全 apply 修復候選 |
| [ ] TODO | 025 | [Python Analyzers](./025-python-analyzers.md) | Python analyzer adapters 可用 |
| [ ] TODO | 026 | [Go Rust And Semgrep Analyzers](./026-go-rust-and-semgrep-analyzers.md) | Go/Rust/Semgrep analyzer 可用 |
| [ ] TODO | 027 | [Deep Review Tools And Skills](./027-deep-review-tools-and-skills.md) | deep review 可安全使用 tools/skills |
| [ ] TODO | 028 | [Provider Reliability And Cost Controls](./028-provider-reliability-and-cost-controls.md) | provider 成本、retry、metrics 可控 |
| [ ] TODO | 029 | [Security Privacy And Data Policy](./029-security-privacy-and-data-policy.md) | AI review 資料流有安全與隱私預設 |
| [ ] TODO | 030 | [CI Gate](./030-ci-gate.md) | PR/branch CI 穩定跑 typecheck/test/build/e2e |
| [ ] TODO | 031 | [Release Automation](./031-release-automation.md) | release pipeline 可重複產生 artifacts |
| [ ] TODO | 032 | [macOS Signing And Notarization](./032-macos-signing-and-notarization.md) | macOS release 可被信任執行 |
| [ ] TODO | 033 | [Multi Platform Packages And Update Check](./033-multi-platform-packages-and-update-check.md) | 多平台 npm 與 update check 可用 |
| [ ] TODO | 034 | [Direct Tarball Self Update](./034-direct-tarball-self-update.md) | direct tarball self-update 可安全執行 |
| [ ] TODO | 035 | [Documentation And Onboarding](./035-documentation-and-onboarding.md) | 使用者可完成安裝、設定、first review |
| [ ] TODO | 036 | [Large Patch Review Budget And Coverage](./036-large-patch-review-budget-and-coverage.md) | 大型 patch 可按完整 hunk 納入預算並回報 coverage |
| [ ] TODO | 037 | [Production Readiness Gate](./037-production-readiness-gate.md) | 可標記 production-ready release |

## 每個 plan 完成前檢查

- `bun run typecheck`
- `bun run test`
- `bun run build`
- `./dist/reviewstuff --version`
- `./dist/reviewstuff --help`
- 該 plan 自己列出的驗收指令

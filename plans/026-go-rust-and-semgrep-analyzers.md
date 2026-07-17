# 026 - Go Rust And Semgrep Analyzers

## Goal

在 TypeScript 與 Python analyzer pattern 穩定後，擴充 Go、Rust 與 optional Semgrep。

## Working State

完成後 Go、Rust 專案會自動使用已安裝工具；Semgrep 若安裝且啟用則納入 review context。

## Scope

包含：

- Go analyzer：`go vet ./...`；Go gate：`go test ./...`
- Rust analyzer：`cargo clippy`；Rust gate：`cargo test`
- optional Semgrep adapter
- analyzer selection by detected language/files
- analyzer diagnostics in doctor

不包含：

- 自動安裝工具
- 修改使用者 package manager config
- full LSP integration
- running expensive analyzers when no related files changed

## Implementation Steps

1. 擴充 analyzer registry 的 language selection。
2. 透過 017 的 analyzer concrete adapter 與 `CommandRunner` 實作 `go vet` 與 fixture
   tests；registry 只暴露 typed operations，不接受 shell string。`go test` 走 allowlisted
   `GateRunner`，只在明確啟用且 isolated 的 flow 執行。
3. 以相同 boundary 實作 `cargo clippy` analyzer 與 `cargo test` gate；優先使用 tool 的
   machine-readable output，parser 需綁 tool/version fixture。Cargo target、Semgrep cache 與其他
   tool output 必須導向 temp/cache service 或在 isolated workspace 執行。
4. 以相同 boundary 實作 optional Semgrep adapter，預設保守啟用策略。
5. doctor 顯示每個 analyzer 的 available/configured/skipped 狀態。

## Verification

```bash
bun run test
./dist/reviewstuff doctor --json
./dist/reviewstuff review --engine fake --json
```

## Acceptance Criteria

- Go/Rust analyzer、Go/Rust gate 與 Semgrep 各有 fixture test。
- missing optional tool 不 crash。
- analyzer timeout/output cap 可測。
- unrelated language changes 不觸發昂貴 analyzer。
- diagnostics 在 session/report 中可追蹤。
- analyzers 不直接使用 `@effect/platform/Command`、`Bun.spawn` 或 shell。
- test gates 不會在一般 review 因語言偵測而自動執行，且不寫使用者工作樹。
- analyzers 的 target/cache/output 不寫 reviewed worktree。

## Learning Focus

- analyzer registry 從單一語言擴展到多語言。
- 成本較高的 deterministic tools 如何被 scope selection 控制。

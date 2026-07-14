# 026 - Go Rust And Semgrep Analyzers

## Goal

在 TypeScript 與 Python analyzer pattern 穩定後，擴充 Go、Rust 與 optional Semgrep。

## Working State

完成後 Go、Rust 專案會自動使用已安裝工具；Semgrep 若安裝且啟用則納入 review context。

## Scope

包含：

- Go adapters：`go test ./...`、`go vet ./...`
- Rust adapters：`cargo test`、`cargo clippy`
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
2. 透過 017 的 analyzer concrete adapter 與 `CommandRunner` 實作 Go adapters 和 fixture
   tests；registry 只暴露 typed operations，不接受 shell string。
3. 以相同 boundary 實作 Rust adapters 與 fixture tests。
4. 以相同 boundary 實作 optional Semgrep adapter，預設保守啟用策略。
5. doctor 顯示每個 analyzer 的 available/configured/skipped 狀態。

## Verification

```bash
bun run test
./dist/reviewstuff doctor --json
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --json
```

## Acceptance Criteria

- Go/Rust/Semgrep analyzer 各有 fixture test。
- missing optional tool 不 crash。
- analyzer timeout/output cap 可測。
- unrelated language changes 不觸發昂貴 analyzer。
- diagnostics 在 session/report 中可追蹤。
- analyzers 不直接使用 `@effect/platform/Command`、`Bun.spawn` 或 shell。

## Learning Focus

- analyzer registry 從單一語言擴展到多語言。
- 成本較高的 deterministic tools 如何被 scope selection 控制。

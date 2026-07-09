# 022 - Multi Language Analyzers

## Goal

補齊常見語言 analyzer，讓 review context 不只依賴 LLM。

## Working State

完成後 TypeScript、Python、Go、Rust 專案會自動使用已安裝工具；缺工具只警告不阻斷 review。

## Scope

包含：

- Python adapters：`ruff`、`mypy`、`pytest`
- Go adapters：`go test ./...`、`go vet ./...`
- Rust adapters：`cargo test`、`cargo clippy`
- optional Semgrep adapter
- analyzer selection by detected language/files
- analyzer diagnostics in doctor

不包含：

- 自動安裝工具
- 修改使用者 package manager config
- full LSP integration

## Implementation Steps

1. 擴充 analyzer registry。
2. 為每個 tool 定義 command、timeout、output cap、parser。
3. missing tool 回 warning diagnostic。
4. analyzer results merge into `ReviewRequestV1`。
5. doctor 顯示各 analyzer 可用性。

## Verification

```bash
bun run test
./dist/reviewstuff doctor --json
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --json
```

## Acceptance Criteria

- 每個 analyzer 有 fixture test。
- missing optional tool 不 crash。
- analyzer timeout/output cap 可測。
- diagnostics 在 session/report 中可追蹤。

## Learning Focus

- tool adapter pattern。
- 將 deterministic analyzer signal 融入 AI review context。

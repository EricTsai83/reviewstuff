# 014 - External Analyzer Adapters

## Goal

接入各語言既有工具，把 diagnostics 正規化進 review context。

## Working State

完成後已安裝工具會被使用；沒安裝工具只降級，不中斷 review。

## Scope

包含：

- `src/analyzers/adapter.ts`
- `src/analyzers/runner.ts`
- `ToolDiagnosticV1`
- TypeScript/Python/Go/Rust first-pass adapters
- timeout/concurrency/cache

不包含：

- 強制安裝工具
- 自動修改 package manager config
- 完整 LSP integration

## Initial Tools

- TypeScript: `tsc --noEmit`
- Python: `ruff`, `mypy`, `pytest`
- Go: `go test ./...`, `go vet ./...`
- Rust: `cargo test`, `cargo clippy`
- Optional multi-language: Semgrep

## Verification

```bash
pnpm test
reviewstuff doctor --json
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --json
```

## Acceptance Criteria

- analyzer output 正規化成 `ToolDiagnosticV1`。
- missing tool 是 warning，不是 crash。
- analyzer 有 timeout 和 output limit。


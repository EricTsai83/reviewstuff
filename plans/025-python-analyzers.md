# 025 - Python Analyzers

## Goal

補齊第一組非 TypeScript analyzer，讓 review context 不只依賴 LLM。

## Working State

完成後 Python 專案會自動使用已安裝工具；缺工具只警告不阻斷 review。

## Scope

包含：

- Python adapters：`ruff`、`mypy`、`pytest`
- analyzer selection by detected language/files
- analyzer diagnostics in doctor

不包含：

- Go adapters
- Rust adapters
- Semgrep adapter
- 自動安裝工具
- 修改使用者 package manager config
- full LSP integration

## Implementation Steps

1. 擴充 analyzer registry，支援 language-specific analyzer group。
2. 為 Python tools 定義 typed analyzer operation、timeout、output cap、parser；沿用
   017 的 analyzer live adapter 與 `CommandRunner`，不得讓 use-case/agent 傳入
   executable 或 shell string。
3. missing tool 回 warning diagnostic。
4. analyzer results merge into `ReviewRequestV1`。
5. doctor 顯示 Python analyzer 可用性。

## Verification

```bash
bun run test
./dist/reviewstuff doctor --json
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --json
```

## Acceptance Criteria

- 每個 Python analyzer 有 fixture test。
- missing optional tool 不 crash。
- analyzer timeout/output cap 可測。
- diagnostics 在 session/report 中可追蹤。
- Python analyzer 不直接使用 `@effect/platform/Command`、`Bun.spawn` 或 shell。

## Learning Focus

- language-specific tool adapter pattern。
- 將 deterministic analyzer signal 融入 AI review context。

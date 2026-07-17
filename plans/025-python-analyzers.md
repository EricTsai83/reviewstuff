# 025 - Python Analyzers

## Goal

補齊第一組非 TypeScript analyzer，讓 review context 不只依賴 LLM。

## Working State

完成後 Python 專案會自動使用已安裝工具；缺工具只警告不阻斷 review。

## Scope

包含：

- Python analyzers：`ruff`、`mypy`
- Python gate：`pytest`（沿用 `GateRunner`，只在明確啟用的 isolated fix/deep-review flow 執行）
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
2. 為 `ruff` / `mypy` 定義 typed analyzer operation、timeout、output cap、version-aware
   machine-readable parser；沿用
   017 的 analyzer concrete adapter 與 `CommandRunner`，不得讓 use-case/agent 傳入
   executable 或 shell string。
3. `pytest` 是 test gate，不偽裝成 source diagnostic analyzer；只透過 allowlisted `GateRunner`
   在 materialized temp workspace 執行，預設 review 不自動跑完整 test suite。
   `ruff` / `mypy` cache 也必須導向 temp/cache service 或在 isolated workspace 執行。
4. missing tool 回 availability warning，不製造假的 source diagnostic。
5. analyzer results merge into `ReviewRequestV1`。
6. doctor 分開顯示 Python analyzer 與 gate 的 available/configured/skipped 狀態。

## Verification

```bash
bun run test
./dist/reviewstuff doctor --json
./dist/reviewstuff review --engine fake --json
```

## Acceptance Criteria

- `ruff` / `mypy` analyzer 與 `pytest` gate 各有 fixture test。
- missing optional tool 不 crash。
- analyzer timeout/output cap 可測。
- diagnostics 在 session/report 中可追蹤。
- Python analyzer 不直接使用 `@effect/platform/Command`、`Bun.spawn` 或 shell。
- 一般 review 不會因偵測到 Python 就自動跑 `pytest`；gate 寫入只發生在 isolated workspace。
- analyzer cache/output 不寫 reviewed worktree。

## Learning Focus

- language-specific tool adapter pattern。
- 將 deterministic analyzer signal 融入 AI review context。

# 017 - External Analyzer Adapters

## Goal

接入第一個外部 analyzer，把 diagnostics 正規化進 review context。

## Working State

完成後 TypeScript 專案若有 `tsc` 可用就會被使用；沒安裝工具只降級，不中斷 review。

## Scope

包含：

- `src/analyzers/adapter.ts`
- `src/analyzers/runner.ts`
- `ToolDiagnosticV1`
- TypeScript first-pass adapter：`tsc --noEmit`
- timeout/concurrency/cache
- analyzer concrete adapter 透過既有 `CommandRunner` service 執行 subprocess；
  analyzer contract 不暴露 command/platform types

不包含：

- Python/Go/Rust adapters
- Semgrep
- 強制安裝工具
- 自動修改 package manager config
- 完整 LSP integration

## Initial Tools

- TypeScript: `tsc --noEmit`

## Verification

```bash
bun run test
reviewstuff doctor --json
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --json
```

## Acceptance Criteria

- analyzer output 正規化成 `ToolDiagnosticV1`。
- missing tool 是 warning，不是 crash。
- analyzer 有 timeout 和 output limit。
- use-case/agent 只依賴 analyzer semantic service，不直接依賴 `CommandRunner`。
- analyzer 不直接呼叫 `@effect/platform/Command`、`child_process`、`Bun.spawn`
  或 shell string。

## Learning Focus

- subprocess diagnostics normalization。
- missing optional tool 的 graceful degradation。

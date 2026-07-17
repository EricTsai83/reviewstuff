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
- TypeScript first-pass adapter：project-local `tsc --noEmit` diagnostics
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

- TypeScript: resolve the reviewed repo's project-local `tsc`, then invoke argv equivalent to
  `tsc --noEmit` without a shell. Do not download a compiler or silently fall back to an unrelated
  global version. Route `tsBuildInfoFile` to a temporary location (or otherwise disable writes) so
  analyzer execution does not modify the reviewed worktree.

## Implementation Steps

1. 定義 versioned `ToolDiagnosticV1` 與 analyzer operation/result/error schema。
2. 只從 reviewed repo 的 package metadata / local binary discovery 選擇已安裝的 `tsc`；
   executable path 由 concrete adapter 決定，不由 agent/provider 傳入。
3. parser 支援 TypeScript 的 multiline diagnostics、non-zero diagnostic exit 與真正的
   spawn/runtime failure，不能把「發現 type error」誤判成 analyzer crash。
4. cache key 包含 tool/version、config、scope/preimage hash；timeout 或 truncated output 不可 cache
   成成功結果。
5. doctor 回報 available/version/configured/skipped，不安裝或修改使用者 dependency。

## Verification

```bash
bun run test
./dist/reviewstuff doctor --json
./dist/reviewstuff review --engine fake --json
```

## Acceptance Criteria

- analyzer output 正規化成 `ToolDiagnosticV1`。
- missing tool 是 warning，不是 crash。
- analyzer 有 timeout 和 output limit。
- use-case/agent 只依賴 analyzer semantic service，不直接依賴 `CommandRunner`。
- analyzer 不直接呼叫 `@effect/platform/Command`、`child_process`、`Bun.spawn`
  或 shell string。
- analyzer 不寫 reviewed worktree；diagnostic exit、timeout、output truncation、spawn failure 有不同結果。

## Learning Focus

- subprocess diagnostics normalization。
- missing optional tool 的 graceful degradation。

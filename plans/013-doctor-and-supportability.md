# 013 - Doctor And Supportability

## Goal

讓 production binary 有足夠診斷資訊，方便使用者在本機 review 前確認環境。

Doctor 必須適用於多語言 repo；它可以回報 TypeScript tooling 狀態，但不能把 TypeScript tooling 缺失視為全域 failure。

## Depends On

- 001 - Bun Standalone MVP
- 004 - Review Session Storage

## Scope

包含：

- 擴充 `reviewstuff doctor`。
- binary metadata。
- provider/git/config/session diagnostics。

不包含：

- telemetry。
- remote log upload。

## Doctor Checks

Add checks:

```text
runtime.binary
runtime.version
git.available
git.repository
git.branch
storage.root
storage.writable
config.valid
engine.pi
engine.claude
engine.codex
gates.configured
languages.detected
adapters.available
tools.typescript
tools.python
tools.go
tools.rust
```

## Output

Human:

```text
[pass] Runtime       reviewstuff 0.1.0 darwin-arm64
[pass] Git           repo ready on main
[warn] Gates         no gates configured
[fail] Claude        not logged in
```

JSON:

```bash
reviewstuff doctor --json
```

Schema:

```ts
interface DoctorReportV1 {
  version: 1
  status: "pass" | "warn" | "fail"
  checks: Array<{
    id: string
    label: string
    status: "pass" | "warn" | "fail"
    message: string
    remediation?: string
  }>
}
```

## Acceptance Criteria

- Doctor works from standalone binary.
- Doctor does not require AI credentials to run.
- Doctor clearly separates warnings from failures.
- JSON output is stable for agents/CI.
- Doctor reports language/tool availability without requiring every language tool to be installed.

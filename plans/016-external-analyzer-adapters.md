# 016 - External Analyzer Adapters

## Goal

接入各語言既有 compiler/linter/test tools，把它們的輸出正規化成 `ToolDiagnosticV1`，供 review engine 和 fix iteration 使用。

這讓 ReviewStuff 能支援多語言 repo，而不是自己重寫每種語言的 compiler 或 static analyzer。

## Depends On

- 015 - Language Agnostic Review Core

## Scope

包含：

- Analyzer adapter interface。
- Tool discovery。
- Timeouts/concurrency limits。
- Diagnostics normalization。
- First-pass adapters for TypeScript, Python, Go, Rust。

不包含：

- 強制安裝任何語言工具。
- 自動修改使用者 package manager config。
- 完整 LSP integration。
- Full Semgrep ruleset management。
- Agent tool orchestration；017 may call these adapters through `runAnalyzer`.

## Adapter Model

Add:

```text
src/analyzers/adapter.ts
src/analyzers/runner.ts
src/analyzers/diagnostics.ts
```

Shape:

```ts
interface AnalyzerAdapter {
  id: string
  language: LanguageId | "multi"
  isAvailable(input: AnalyzerContext): Effect.Effect<boolean, never>
  run(input: AnalyzerRunInput): Effect.Effect<ToolDiagnosticV1[], AnalyzerError>
}
```

## Initial Adapters

TypeScript/JavaScript:

- Discover `package.json`, `tsconfig.json`, lockfiles.
- Prefer configured project gates when available.
- Support `tsc --noEmit` diagnostics when available.

Python:

- Discover `pyproject.toml`, `requirements.txt`, `uv.lock`, `poetry.lock`.
- Support `ruff`, `mypy`, `pytest` if available.

Go:

- Discover `go.mod`.
- Support `go test ./...` and `go vet ./...`.

Rust:

- Discover `Cargo.toml`.
- Support `cargo test` and `cargo clippy` if available.

Multi-language optional:

- Support Semgrep only when installed/configured.
- Treat Semgrep as an optional analyzer, not an MVP runtime dependency.

## Performance Rules

- Run changed-file scoped analyzers before whole-project analyzers when possible.
- Use bounded concurrency.
- Apply per-tool timeout.
- Cache analyzer result by commit hash, command, config file hash, and changed file set.
- Never block basic AI review solely because an optional analyzer is missing.
- 017 deep review may call analyzers repeatedly, so analyzer results must be cacheable and side-effect free unless a gate is explicitly configured to mutate nothing.

## Failure Rules

- Missing tool: emit `adapter_unavailable` status, not a failure.
- Tool exits with diagnostics: convert to `ToolDiagnosticV1`.
- Tool crashes or times out: emit warning diagnostic and continue other adapters.

## Verification

```bash
pnpm typecheck
pnpm test
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff --staged --agent
reviewstuff doctor --json
```

Fixture tests should include fake analyzer binaries on PATH so CI is deterministic.

## Acceptance Criteria

- Analyzer outputs are normalized to `ToolDiagnosticV1`.
- TypeScript adapter does not run for pure Python/Go/Rust repos.
- Python/Go/Rust repos can be reviewed without Node tooling.
- Missing analyzers produce warnings, not crashes.
- Doctor reports analyzer availability by language.

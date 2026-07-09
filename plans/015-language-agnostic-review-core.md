# 015 - Language Agnostic Review Core

## Goal

讓 ReviewStuff 的 review/fix/session core 不綁定 TypeScript，為 Python、Go、Rust、Java、Kotlin 等語言預留穩定 extension points。

TypeScript 可以是第一個成熟 adapter，但不能是 core abstraction。

## Working State

做完這份 plan 後，ReviewStuff 的 session、finding、prompt context 可以表示多語言檔案。TypeScript review 仍然可用，非 TypeScript 檔案至少能走 generic review context。

## Depends On

- 004 - Review Session Storage
- 007 - Agent JSON Protocol

## Scope

包含：

- Language detection。
- Language-neutral review schema。
- Adapter interface。
- Tool diagnostics normalization。
- Prompt context boundary。

不包含：

- 實作所有語言 analyzer。
- Tree-sitter deep parsing。
- LSP integration。
- MCP server。
- Agentic tool loop；deep review agent 由 017 實作。

## Core Architecture

```text
git diff / repo files
  -> language detector
  -> language adapters
  -> normalized review context
  -> review engine
  -> language-neutral findings
  -> session storage / agent output / fix workflow
```

The core engine should only depend on:

- changed files
- diff hunks
- repo metadata
- normalized language context
- normalized diagnostics

It must not directly depend on:

- `tsconfig.json`
- `package.json`
- ESLint
- Vitest
- Node module layout

## Data Shapes

Add:

```text
src/review/schema.ts
src/languages/detect.ts
src/languages/adapter.ts
```

Core types:

```ts
type LanguageId =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "kotlin"
  | "markdown"
  | "json"
  | "yaml"
  | "unknown"

interface ReviewFileContextV1 {
  path: string
  language: LanguageId
  changedRanges: Array<{ startLine: number; endLine: number }>
  symbols?: Array<{ name: string; kind: string; line: number }>
  nearbyCode?: string
  diagnostics: ToolDiagnosticV1[]
}

interface ToolDiagnosticV1 {
  source: string
  language?: LanguageId
  path: string
  line?: number
  column?: number
  severity: "info" | "warning" | "error"
  code?: string
  message: string
}

interface ReviewFindingV1 {
  id: string
  sessionId: string
  language: LanguageId
  severity: "info" | "warning" | "error"
  fileName: string
  line?: number
  title: string
  rationale: string
  suggestion?: string
  patch?: string
}
```

Adapter interface:

```ts
interface LanguageAdapter {
  id: LanguageId
  detectProject(input: DetectProjectInput): Effect.Effect<LanguageProjectInfo, never>
  collectContext(input: CollectContextInput): Effect.Effect<ReviewFileContextV1[], AdapterError>
  renderPromptContext(input: RenderPromptContextInput): Effect.Effect<string, AdapterError>
}
```

## Detection Rules

Language detection should combine:

- file extension
- lock/config files
- shebang
- repo-level markers

Unknown files should still be reviewable with generic text/diff context.

## Prompt Rule

Prompts should be built from normalized context. A TypeScript-specific prompt section may exist, but it must be contributed by the TypeScript adapter, not hard-coded in the core review engine.

017 can reuse the same normalized context for deep review. The language core should not know whether findings came from deterministic review or agentic deep review.

## Verification

```bash
pnpm typecheck
pnpm test
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff --staged --agent
```

Add fixture repos:

```text
test/fixtures/repos/typescript-basic
test/fixtures/repos/python-basic
test/fixtures/repos/go-basic
test/fixtures/repos/rust-basic
```

## Acceptance Criteria

- TypeScript review still works.
- Non-TypeScript files produce language-tagged review context.
- Stored findings use language-neutral schema.
- Agent JSON events do not assume TypeScript.
- Missing language adapter does not crash review; it falls back to generic review context.

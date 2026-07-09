# 004 - Review Session Storage

## Goal

保存每次 review 的 session、diff、findings、reviewer runs，讓後續 `findings`、`prompts`、`fix` 不需要重跑模型。

Storage schema 必須能保存非 TypeScript findings。任何欄位命名都不應假設 findings 只來自 `tsc`、ESLint、Vitest 或 Node 專案。

## Working State

做完這份 plan 後，每次非 skipped review 都會產生 repo-local session。CLI 原本的 review output 仍可用，同時後續 command 可以用 session id 或 latest 載入 diff/findings。

## Depends On

- 001 - Bun Standalone MVP

## Scope

包含：

- Repo-local `.reviewstuff/sessions`.
- Versioned JSON schema。
- Atomic writes。
- Latest session lookup。

不包含：

- prompts command。
- fix workflow。
- remote/backend sync。

## Storage Layout

```text
.reviewstuff/
  sessions/
    <branch-hash>/
      <session-id>/
        session.json
        git.json
        diff.json
        findings/
          <finding-id>.json
```

## Data Shapes

### `session.json`

```ts
interface ReviewSessionV1 {
  version: 1
  id: string
  createdAt: string
  updatedAt: string
  repoRoot: string
  currentBranch: string
  baseRef?: string
  headCommit: string
  scope: {
    kind: "staged" | "working_tree" | "since"
    ref?: string
    files: string[]
  }
  languages: string[]
  status: "completed" | "failed" | "partial" | "skipped"
  reviewerRuns: ReviewerRun[]
  findingCount: number
  exitCode: number
}
```

### `finding.json`

Extend current `AggregatedFinding`:

```ts
interface StoredFindingV1 extends AggregatedFinding {
  version: 1
  sessionId: string
  createdAt: string
  updatedAt: string
  language: string
  status: "open" | "fixed" | "applied" | "rejected" | "stale"
  actionStatus: "created" | "fix_generated" | "applied" | "rejected"
  codegenInstructions: string
  suggestions: string[]
  toolDiagnostics?: ToolDiagnosticSnapshot[]
}

interface ToolDiagnosticSnapshot {
  source: string
  path: string
  line?: number
  column?: number
  severity: "info" | "warning" | "error"
  code?: string
  message: string
}
```

`language` starts as a string for schema compatibility. 015 can tighten it to `LanguageId` after the language-agnostic core exists.

## Implementation

Add:

```text
src/storage/schema.ts
src/storage/service.ts
src/storage/session.ts
```

Effect service:

```ts
interface ReviewStorageShape {
  createSession(input: CreateSessionInput): Effect.Effect<ReviewSessionV1, StorageError>
  saveDiff(sessionId: string, diff: unknown): Effect.Effect<void, StorageError>
  saveFindings(sessionId: string, findings: StoredFindingV1[]): Effect.Effect<void, StorageError>
  getLatestSession(): Effect.Effect<ReviewSessionV1 | null, StorageError>
  loadSession(idOrLatest: string): Effect.Effect<LoadedSession, StorageError>
}
```

Rules:

- Write JSON with temp file + rename.
- Reject paths outside repo root.
- Keep storage independent from terminal rendering.
- Do not commit `.reviewstuff/sessions` by default.

## Verification

```bash
pnpm typecheck
pnpm test
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff --staged --json
find .reviewstuff/sessions -type f
```

## Acceptance Criteria

- Every non-skipped review creates a session.
- Stored findings match report findings.
- Session can be loaded by id and latest.
- Partial reviewer failure still persists successful findings.
- Session stores detected languages and findings can represent non-TypeScript files.

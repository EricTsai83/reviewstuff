# 006 - Fix Iteration Workflow

## Goal

讓 `fix` 預設使用 stored findings，而不是重新跑 review。支援 dry-run、worktree validation、apply、status update。

Fix workflow 必須以 stored finding 的 language/context 為輸入。TypeScript-specific fix behavior 可以由 TypeScript adapter 提供，但 core `fix` command 不能硬編碼 Node/TS assumptions。

## Working State

做完這份 plan 後，使用者可以從 stored findings 進入修復迭代：先 `fix --dry-run` 產生候選修復與驗證結果，再用 `fix --apply` 安全套用。

## Depends On

- 004 - Review Session Storage
- 005 - Findings And Prompt Replay

## Scope

包含：

- `reviewstuff fix --from latest`
- fix attempt storage
- gates validation
- apply status update

不包含：

- interactive TUI。
- conflict resolver。
- 實作所有語言的修復策略。

## Command

```bash
reviewstuff fix
reviewstuff fix --from latest
reviewstuff fix --from <session-id>
reviewstuff fix --from review
reviewstuff fix --finding <id>
reviewstuff fix --fix-severity critical|error|warning|info
reviewstuff fix --dry-run
reviewstuff fix --apply
```

Defaults:

- `--from latest`
- `--fix-severity error`
- no source write unless `--apply`

## Fix Attempt Schema

```ts
interface FixAttemptV1 {
  version: 1
  id: string
  sessionId: string
  findingIds: string[]
  createdAt: string
  model: string
  engine: "pi" | "claude" | "codex"
  status: "generated" | "validated" | "failed_gates" | "applied"
  files: Array<{
    path: string
    language?: string
    preimageSha256: string
    postimageSha256: string
    content: string
    explanation: string
  }>
  gates: GateResult[]
  allGreen: boolean
}
```

Save to:

```text
.reviewstuff/sessions/<branch-hash>/<session-id>/fixes/<fix-attempt-id>.json
```

## Data Flow

```text
load session
  -> filter open findings by id/severity
  -> build fix prompt from stored findings + language adapter context + current file content
  -> Engines.generateFixes
  -> temp worktree
  -> write candidate files
  -> run configured gates and available language analyzer adapters
  -> save fix attempt
  -> if --apply and allGreen, write to real worktree
  -> update finding status
```

## Safety Rules

- Reject fix paths outside repo root.
- `--dry-run` never writes source files.
- `--apply` requires gates green unless no gates are configured.
- Before applying, verify current file hash equals preimage hash.
- If preimage mismatch, refuse apply and mark attempt not applied.

## Verification

```bash
pnpm test
pnpm build
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff --staged --json
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff fix --dry-run
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff fix --apply
```

## Acceptance Criteria

- `fix --dry-run` creates a fix attempt but does not modify source.
- `fix --apply` modifies source only after validation.
- Applied findings are no longer shown by default in `findings`.
- `fix --from review` preserves old behavior as compatibility mode.
- `fix` works for non-TypeScript findings at least in dry-run/generic patch mode.

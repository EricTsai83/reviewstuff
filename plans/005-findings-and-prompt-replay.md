# 005 - Findings And Prompt Replay

## Goal

提供 CodeRabbit-like 的 local review iteration：review 完後可以重新查看 findings，也可以重播每個 finding 的修復 prompt。

Prompt replay 要從 stored finding 產生，不應假設 finding 來自 TypeScript。語言特定上下文應由 015 的 language adapter 補充。

## Depends On

- 004 - Review Session Storage

## Scope

包含：

- `reviewstuff findings`
- `reviewstuff prompts`
- per-finding prompt generation

不包含：

- 自動套用修復。
- agent streaming protocol。

## Commands

```bash
reviewstuff findings
reviewstuff findings --session latest
reviewstuff findings --session <session-id>
reviewstuff findings --status open|fixed|applied|rejected|stale|all
reviewstuff findings --severity critical|error|warning|info
reviewstuff findings --json
```

```bash
reviewstuff prompts
reviewstuff prompts --session latest
reviewstuff prompts --finding <finding-id>
reviewstuff prompts --json
```

## Prompt Format

Generate and store:

```text
Verify this finding against the current code before making changes.
Fix only the issue described below if it is still valid.
Keep the change minimal, preserve existing behavior, and run the configured validation gates.
If the finding is stale or already fixed, skip it with a short reason.

Finding:
- Language: <language>
- Severity: <severity>
- Category: <category>
- File: <file>:<line>
- Title: <title>
- Rationale: <rationale>
- Suggested fix: <suggestion>
Relevant diagnostics:
<tool diagnostics, if any>
```

Save to:

```text
.reviewstuff/sessions/<branch-hash>/<session-id>/prompts/<finding-id>.md
```

Also save the same text in:

```ts
StoredFindingV1.codegenInstructions
```

## Implementation

Add:

```text
src/review/prompts.ts
src/commands/findings.ts
src/commands/prompts.ts
```

Update:

```text
src/cli.ts
```

## Verification

```bash
pnpm build
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff --staged --json
./dist/reviewstuff findings
./dist/reviewstuff findings --json
./dist/reviewstuff prompts
```

## Acceptance Criteria

- `findings` does not call any AI engine.
- `prompts` does not call any AI engine.
- Latest session is selected by default.
- JSON output is machine-readable and stable.
- Missing session exits with usage error.
- Prompt output includes language metadata when available.

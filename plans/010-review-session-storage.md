# 010 - Review Session Storage

## Goal

保存 review session、diff、findings、reviewer runs，支援後續查詢與修復迭代。

## Working State

完成後每次非 skipped review 都會寫入：

```text
.reviewstuff/sessions/<branch-hash>/<session-id>/
```

## Scope

包含：

- `src/storage/schema.ts`
- `src/storage/service.ts`
- session id / latest lookup
- atomic JSON writes
- `.reviewstuff/` gitignore guidance
- retention metadata and safe cleanup hooks

不包含：

- findings command
- prompts command
- fix workflow
- privacy redaction policy implementation

## Implementation Steps

1. 定義 `ReviewSessionV1`、`StoredFindingV1`。
2. 保存 `session.json`、`git.json`、`diff.json`、`findings/*.json`。
3. 所有寫入使用 temp file + rename。
4. 路徑限制在 repo root。
5. review command 完成後寫 session。
6. session metadata 記錄 createdAt、schemaVersion、redaction status、provider/model/scope summary。
7. 預留 safe cleanup API，供 029 data retention policy 使用。

## Verification

```bash
bun run test
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --json
find .reviewstuff/sessions -type f
```

## Acceptance Criteria

- session 可用 id 和 latest 載入。
- partial reviewer failure 仍保存成功 findings。
- storage schema 有 version。
- session storage 不保存 secrets；若 request/prompt 尚未有完整 redaction policy，metadata 要標示 redaction status。

## Learning Focus

- versioned persisted schema。
- atomic file writes 與 repo-root path containment。

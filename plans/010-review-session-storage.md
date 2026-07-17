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
- `src/storage/storage-service.ts`
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
2. 在 `storage/storage-service.ts` 定義不暴露 filesystem/path types 的
   `StorageService` contract，並在同一 canonical module 建立保存
   `session.json`、`git.json`、`diff.json`、`findings/*.json` 的 implementation 與
   `layer`；use-case tests 在測試附近建立 fake layer。
   `git.json` 記錄每個 reviewed file 的 source、preimage hash，以及可用時的 commit/index blob id；
   不為了 fix/replay 默認複製完整 source snapshot。
3. 所有寫入使用 temp file + rename。
4. 路徑限制在 repo root；拒絕 storage root、session directory 或 target file 的 symlink
   traversal，temp file 必須建立在 target 同一 filesystem 才能依賴 atomic rename。
5. review use-case 透過 `StorageService` 寫 session；command 只 render 結果。
6. session metadata 記錄 createdAt、schemaVersion、redaction status、provider/model/scope summary。
7. 預留 safe cleanup API，供 029 data retention policy 使用。

## Verification

```bash
bun run test
./dist/reviewstuff review --engine fake --json
find .reviewstuff/sessions -type f
```

## Acceptance Criteria

- session 可用 id 和 latest 載入。
- partial reviewer failure 仍保存成功 findings。
- storage schema 有 version。
- session storage 不保存 secrets；若 request/prompt 尚未有完整 redaction policy，metadata 要標示 redaction status。
- preimage metadata 足以偵測工作樹/index drift，但預設不重複保存完整 source file snapshot。
- review use-case 不直接依賴 filesystem/path/platform service。
- corrupt/truncated session 與 symlink/path traversal 會被 typed error 拒絕，不讀寫 repo 外路徑。

## Learning Focus

- versioned persisted schema。
- atomic file writes 與 repo-root path containment。

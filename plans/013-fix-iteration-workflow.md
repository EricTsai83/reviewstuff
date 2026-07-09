# 013 - Fix Iteration Workflow

## Goal

從 stored findings 產生修復候選，先完成 dry-run 與驗證流程。

## Working State

完成後可用：

```bash
reviewstuff fix --dry-run
```

## Scope

包含：

- fix attempt schema
- temp worktree
- gates validation
- preimage hash check
- dry-run report

不包含：

- `--apply`
- interactive TUI
- conflict resolver
- auto commit

## Implementation Steps

1. 從 session 載入 open findings。
2. 產生 fix prompt。
3. engine 回傳候選 file edits。
4. 在 temp worktree 套用並跑 gates。
5. 保存 fix attempt。
6. dry-run 輸出會改哪些檔案、哪些 gates 通過或失敗。

## Verification

```bash
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --json
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff fix --dry-run
```

## Acceptance Criteria

- dry-run 不改 source files。
- fix attempt 被保存。
- preimage hash mismatch 會在 dry-run report 中標示，不寫回。

## Learning Focus

- 安全地在 temp worktree 驗證修改。
- 將「產生修復」和「套用修復」拆成兩個風險層級。

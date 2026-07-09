# 010 - Fix Iteration Workflow

## Goal

從 stored findings 產生修復候選，先 dry-run，再驗證後 apply。

## Working State

完成後可用：

```bash
reviewstuff fix --dry-run
reviewstuff fix --apply
```

## Scope

包含：

- fix attempt schema
- temp worktree
- gates validation
- preimage hash check
- apply status update

不包含：

- interactive TUI
- conflict resolver
- auto commit

## Implementation Steps

1. 從 session 載入 open findings。
2. 產生 fix prompt。
3. engine 回傳候選 file edits。
4. 在 temp worktree 套用並跑 gates。
5. 保存 fix attempt。
6. `--apply` 前確認 current file hash 沒變。

## Verification

```bash
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --json
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff fix --dry-run
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff fix --apply
```

## Acceptance Criteria

- dry-run 不改 source files。
- apply 只在驗證通過後寫回。
- hash mismatch 時拒絕 apply。


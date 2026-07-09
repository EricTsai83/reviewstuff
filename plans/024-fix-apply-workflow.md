# 024 - Fix Apply Workflow

## Goal

在既有 dry-run 修復流程上，安全支援 `fix --apply`。

## Working State

完成後可以執行：

```bash
reviewstuff fix --dry-run
reviewstuff fix --apply
```

## Scope

包含：

- `fix --apply`
- preimage hash verification
- atomic source file replacement
- gate result requirement
- finding/fix attempt status update
- apply rollback on partial failure

不包含：

- interactive TUI
- auto commit
- conflict resolver UI

## Implementation Steps

1. 將 dry-run fix attempt 保存為 apply candidate。
2. `--apply` 前重驗 preimage hash。
3. 通過 gates 才寫回 source files。
4. 寫回使用 temp file + rename。
5. 更新 finding/fix attempt status。
6. partial failure 時保留可診斷狀態，不留下半套用檔案。

## Verification

```bash
bun run test
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff fix --dry-run
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff fix --apply
```

## Acceptance Criteria

- hash mismatch 拒絕 apply。
- gates failed 拒絕 apply。
- apply 後 findings 狀態可查。
- partial write failure 不破壞工作樹。

## Learning Focus

- 安全修改使用者工作樹。
- apply workflow 的 transactional thinking。

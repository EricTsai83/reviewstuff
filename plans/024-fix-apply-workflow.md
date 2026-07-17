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
- `FixApplier` semantic service contract 與 canonical implementation
- preimage hash verification
- atomic source file replacement
- gate result requirement
- finding/fix attempt status update
- multi-file apply journal、rollback/recovery on partial failure

不包含：

- interactive TUI
- auto commit
- conflict resolver UI
- create/delete/rename file edits

## Implementation Steps

1. 將 dry-run fix attempt 保存為 apply candidate。
2. `--apply` 前重驗 preimage hash。
3. 通過 gates後，fix use-case 才呼叫 `FixApplier`；use-case 不直接取得 filesystem。
4. `FixApplier.layer` 的 implementation 拒絕 symlink/non-regular targets、保留 mode，並在每個
   target 同一 filesystem 建立完整 preimage backup 與 fsynced transaction journal；每個檔案可用
   temp file + rename 原子替換，但不得把多檔 rename 誤稱為全域 atomic transaction。
5. 更新 finding/fix attempt status。
6. partial failure 時依 journal rollback；process crash 後下一次 apply 先偵測並完成 recovery 或
   明確拒絕，journal 未清除前不得更新 finding 為 fixed。

## Verification

```bash
bun run test
./dist/reviewstuff fix --dry-run --engine fake
./dist/reviewstuff fix --apply --engine fake
```

## Acceptance Criteria

- hash mismatch 拒絕 apply。
- gates failed 拒絕 apply。
- apply 後 findings 狀態可查。
- partial write failure 會還原所有已替換 preimage；模擬 process crash 時留下可恢復 journal，
  不會把半套用狀態誤報為成功。
- symlink、permission/mode preservation、disk-full、rename failure 與 recovery 有 deterministic tests。
- `FixApplier` contract 不暴露 platform filesystem/path/error types。

## Learning Focus

- 安全修改使用者工作樹。
- apply workflow 的 transactional thinking。

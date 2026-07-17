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
- versioned `FixRequestV1` / `FixCandidateV1` 與獨立 fix-engine capability
- `FixWorkspace` 與 `GateRunner` semantic service contracts
- temp worktree + exact session preimage materialization
- gates validation
- preimage hash check
- dry-run report
- v1 candidate 只修改既有 regular text files，使用 bounded whole-file/range edits

不包含：

- `--apply`
- interactive TUI
- conflict resolver
- auto commit
- create/delete/rename file edits

## Implementation Steps

1. 從 session 載入 open findings。
2. 從 finding、stored diff 與 preimage metadata 產生 versioned `FixRequestV1`；不要把 file-edit response
   偷塞進只負責 review findings 的 contract，另定義可由 fake/provider 實作的 fix capability。
3. fix capability 回傳經 schema 驗證、路徑受限、包含 preimage hash 的 `FixCandidateV1`。
   `fix --engine/--provider/--model` 沿用 007 的 selection precedence，但 capability check 必須
   確認所選 implementation 支援 fix candidate，不能把 review-only engine 當成可修復。
4. fix use-case 透過 `FixWorkspace` 建立 temp worktree，並以 session 記錄的 commit/index blob
   或 hash-matched current file 精確 materialize staged、unstaged 與 untracked preimage 後才套用
   candidate；不能假設 `HEAD` 等於被 review 的內容，也不能假設 storage 保存完整 source snapshot。
   任一 preimage 無法重建或 hash drift 時整個 attempt 拒絕並要求重新 review。
   接著透過 `GateRunner`
   執行 allowlisted gates；只有 concrete implementations 可依賴 filesystem、Git service 或
   `CommandRunner`。
5. 保存 fix attempt。
6. dry-run 輸出會改哪些檔案、哪些 gates 通過或失敗。

## Verification

```bash
./dist/reviewstuff review --engine fake --json
./dist/reviewstuff fix --dry-run --engine fake
```

## Acceptance Criteria

- dry-run 不改 source files。
- fix attempt 被保存。
- preimage hash mismatch 會在 dry-run report 中標示，不寫回。
- staged、unstaged、untracked preimage 都能在隔離 workspace 被重現，且 gate 造成的寫入不會回到使用者工作樹。
- fix use-case 不直接依賴 filesystem、`CommandRunner` 或 renderer。

## Learning Focus

- 安全地在 temp worktree 驗證修改。
- 將「產生修復」和「套用修復」拆成兩個風險層級。

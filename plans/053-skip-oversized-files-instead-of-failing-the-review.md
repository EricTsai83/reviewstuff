# 053 — Skip oversized files instead of failing the review

[← Plan index](./README.md)

**Depends on:** 050、052。 **Learning:** per-file failure isolation in the Git adapter。

> 排序說明：本 plan 原本是 025 的一段「現況修正」註記。它被提前成獨立 hotfix，因為 019、020
> 開放 committed range 之後，單一檔案 patch 超過輸出上限的機率會大幅上升；若等到 025 才修，
> 真實 repo dogfood 會先撞上整個 review 失敗。025 只保留 selection policy 的集中化與
> coverage 語意，不再處理這裡的失敗路徑。

**Working state:** 單一檔案的 patch 超過 `gitPatchMaxOutputBytes`（4 MiB，`src/git/git-diff.ts`）時，
該檔以 `file-too-large` 出現在 coverage 的 skipped 清單，其餘檔案照常 review；parser 無法歸屬到
target 的 diff output 也成為該檔的 skip，而不是整體 `GitInvalidOutputError`。

**現況：** `file-too-large` 只有 schema 與 renderer 支援（`LargeSkippedFileCoverageSchema`），source 裡
沒有任何 producer。超限時 `GitCommandOutputLimitError` 讓整個 review 失敗。`readGitObjectSize`
（`src/git/git-command.ts`）已存在但未接線，且它對每個 object 各起兩個 subprocess。
`selectTargetRecords`（`src/git/git-diff.ts`）在「多個 record 但沒有一個對得上 target path」時丟
`GitInvalidOutputError`，是同一類「單檔問題升級成全 review 失敗」。

**In:**
- `GitFile` 新增 `oversized` 與 `unsupported` 兩種 kind，與 `text`/`binary` 並列；`run-review` 的
  `buildCoverageFiles` 把它們對應到 `file-too-large` 與新的 `unsupported-diff` skip reason。
- 收 patch 前的大小預檢。不得對每個檔案各起一個 subprocess：tracked 兩側（base 與 index/commit）
  用一次 `git cat-file --batch-check` 查完，untracked 與 working-tree 新側用 FileSystem stat，對應
  `GitExecutionError` 的 `file-inspection` failure。`--batch-check` 需要 stdin，因此 `CommandRunner`
  的 `CommandRequest` 要新增有上限的 optional `stdin`；若實作時判定 stdin 支援成本過高，改用
  `git ls-tree -r -l <rev> -- <paths…>` 一次取得 tree 側大小。
- 預檢通過後仍撞到輸出上限時（例如兩側都在限內但 patch 仍超限），`GitCommandOutputLimitError`
  對該檔轉為 `file-too-large`，不再往上冒成全 review 失敗；其他 git 失敗維持原本 typed error。
- 刪除或接線 `readGitObjectSize`，不留未使用的 code path。
- `unsupported-diff` coverage variant、human/JSON renderer 與 fixtures。

**Out:** binary/media/generated hard exclude 與 override policy（025）、`coverage.complete` 語意的
重新定義（025）、`.reviewstuffignore`（024）、per-file limit 的 config override。

**Steps:** 先在 pure 層加 `GitFile` 兩種 kind 與 coverage variant；再在 `collectDiffPatches` 前插入
一次性的 size precheck；再把單檔輸出上限錯誤降級為 skip；最後補 e2e：一個 4 MiB 以上的
generated 檔加一個正常檔，review 必須成功且 coverage 正確。

**Accept:** oversized file 產生 `file-too-large` skip 而非整體失敗，且 `sizeBytes`/`limitBytes` 正確；
size 預檢對 N 個檔案只起常數個 subprocess，有測試以 fake runner 計數；unattributable diff output
產生 `unsupported-diff` skip；其餘 git 錯誤仍是整體 typed error；report fixture 依 README 的
pre-persistence schema 規則更新。

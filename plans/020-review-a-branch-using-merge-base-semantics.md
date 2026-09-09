# 020 — Review a branch using merge-base semantics

[← Plan index](./README.md)

**Depends on:** 019。 **Learning:** branch comparison vs exact range。

**Working state:** `reviewstuff review --base main` 只 review merge-base 到 `HEAD` 的 branch changes，
填入 019 scope contract 的 `kind: "merge-base"` variant，不 bump schema。

**In:** base ref validation、merge-base resolution（`git merge-base <base> HEAD`，一次解析）、
three-dot-equivalent diff、`baseRef`/`mergeBase`/`to` 進 scope metadata、`--from` 與 `--base` 互斥。
**Out:** automatic base selection（022）、working-tree composition（021）、remote fetching、schema 變更。

**Steps:** 在 019 的 range 收集路徑上以 `mergeBase` 取代 `from`；fixture divergent history、missing merge
base（typed error，不退回 exact range）、detached HEAD、base 等於 HEAD（no-change）；文件化與 `--from`
的差異。

**效能決策點：** 依 019 留下的量測結果決定是否在本 plan 改為「每個 source 一次 `git diff`、由
`parseUnifiedDiff` 拆多個 record」。若改，053 的 size 預檢仍是每檔 skip 的依據，combined output cap
需依 target 數量放大並保留上限；若不改，把量測數字與判斷寫進本 plan 完成備註。

**Accept:** base branch tip 前進不會誤納 upstream-only commits；invalid/ref/missing-merge-base errors typed；
Git commands bounded；CLI flags incompatibility 在 engine call 前失敗；report/request 的 scope 只有
`kind` 與欄位不同，schema version 不變。

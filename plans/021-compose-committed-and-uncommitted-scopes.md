# 021 — Compose committed and uncommitted scopes

[← Plan index](./README.md)

**Depends on:** 020。 **Learning:** explicit scope algebra with a minimal flag surface。

**Working state:** `--from`/`--base` 可與 `--staged` 或 `--working-tree` 組合。組合的語意是單一 diff：
舊側是 range 左端（exact `from` 或 `mergeBase`），新側是 index 或工作樹，再加 untracked（僅
working-tree）。沒有 `--type` flag。

**Flag 代數（只有四個 flag、兩組互斥）：**

| committed 選擇 | uncommitted 選擇 | 結果 scope | patch 舊側 → 新側 | file sources |
| --- | --- | --- | --- | --- |
| 無 | 無 / `--working-tree` | `{ uncommitted: "working-tree" }` | `HEAD` → 工作樹 + untracked | `working-tree`、`untracked` |
| 無 | `--staged` | `{ uncommitted: "staged" }` | `HEAD` → index | `staged` |
| `--from X` / `--base B` | 無 | `{ committed, uncommitted: "none" }` | 左端 → `HEAD` | `committed` |
| `--from X` / `--base B` | `--staged` | `{ committed, uncommitted: "staged" }` | 左端 → index | `staged` |
| `--from X` / `--base B` | `--working-tree` | `{ committed, uncommitted: "working-tree" }` | 左端 → 工作樹 + untracked | `working-tree`、`untracked` |

`--from` 與 `--base` 互斥；`--staged` 與 `--working-tree` 互斥。前兩列就是現行行為。

**設計決策：** 不採「committed diff 與 uncommitted diff 的 union」。union 會讓同一路徑出現兩份
patch、finding 行號指向哪個版本變得模糊，還需要 dedup 規則；單一 diff 天然不重複計數，也不需要
相容矩陣以外的規則。

**In:** pure scope planner（flags → `ReviewScopeV2`，含互斥檢查）、`GitService` 依 scope 選 diff 舊側、
`--working-tree` flag、unmerged paths fail fast、coverage 以 path+source 保留。
**Out:** automatic base inference（022）、path filters（023）、schema 變更、`--type` 或其他 alias。

**Steps:** 建立 pure planner 與其 decision-table 測試；`GitService.readDiff` 把 `committed` 左端當作
`diffBase`；fixtures：同檔在 range 內與工作樹都有改動只產生一份 patch、untracked、conflict、
兩組互斥 flag。

**Accept:** 表格五列各有 e2e；`all` 類組合 deterministic 且每個路徑恰一份 patch；unmerged paths fail
fast；no-change zero engine calls；schema version 不變。

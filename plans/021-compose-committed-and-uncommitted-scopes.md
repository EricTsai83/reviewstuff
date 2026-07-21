# 021 — Compose committed and uncommitted scopes

[← Plan index](./README.md)

**Depends on:** 020。 **Learning:** explicit scope algebra。

**Working state:** `--type committed|uncommitted|all` 有固定語意；`all` 合併 selected committed range 與 staged、
unstaged、untracked changes。

**In:** scope union/dedup、`--staged`/`--working-tree` shortcuts、compatibility matrix、source metadata。
**Out:** automatic base inference、path filters、light workload。

**Steps:** 建立 pure scope planner；GitService 執行 planner operations；以 path+source 保留 coverage；測 staged
and unstaged same file、untracked、conflict、mutually exclusive flags。

**Accept:** shortcuts 只代表 uncommitted variants；`all` deterministic 且不重複計數；unmerged paths fail fast；
no-change zero engine calls。

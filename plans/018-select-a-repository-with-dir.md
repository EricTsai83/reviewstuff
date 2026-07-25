# 018 — Select a repository with `--dir`

[← Plan index](./README.md)

**Depends on:** 012。 **Learning:** changing the containment root safely。

**Working state:** `reviewstuff review --dir ../repo` 對指定 initialized working-tree repository 執行，config、
Git 與後續 paths 都以 canonical repo root 為準；未傳 `--dir` 時，即使從 nested directory 執行，
也會先解析目前 working tree 的 root，而不是把 process cwd 當成 repository root。

**In:** `--dir` validation/canonicalization、repo-root context、relative output paths。 **Out:** multi-repo review、
monorepo graph、remote clone、config 檔名或 serialization format 變更。

**Steps:** 在 command boundary 解析候選 path；Git service 驗證並回傳 canonical root；讓 ConfigService 明確
取得 repo context 而非依賴 process cwd；review use-case 只解析一次 selected repository 並把同一 context
交給 config 與 Git flow；加入 nested cwd、`--dir`、symlink、non-repo、bare repo fixtures。

**Accept:** 不改 process-global cwd；所有 path containment 使用選定 root；不存在路徑與 bare repo 有 typed
error；從 nested directory 執行時仍讀取 root config；`--dir` 的 config 與 diff 一定來自同一 repository；
目前 repo default 行為不回歸。

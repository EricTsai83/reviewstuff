# 018 — Select a repository with `--dir`

[← Plan index](./README.md)

**Depends on:** 017。 **Learning:** changing the containment root safely。

**Working state:** `reviewstuff review --dir ../repo` 對指定 initialized working-tree repository 執行，config、
Git 與後續 paths 都以新 repo root 為準。

**In:** `--dir` validation/canonicalization、repo-root context、relative output paths。 **Out:** multi-repo review、
monorepo graph、remote clone。

**Steps:** 在 command boundary 解析候選 path；Git service 驗證並回傳 canonical root；讓 ConfigService 明確
取得 repo context 而非依賴 process cwd；加入 symlink/non-repo/bare repo fixtures。

**Accept:** 不改 process-global cwd；所有 path containment 使用選定 root；不存在路徑與 bare repo 有 typed
error；目前 repo default 行為不回歸。


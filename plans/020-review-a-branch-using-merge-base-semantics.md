# 020 — Review a branch using merge-base semantics

[← Plan index](./README.md)

**Depends on:** 019。 **Learning:** branch comparison vs exact range。

**Working state:** `reviewstuff review --base main` 只 review merge-base 到 `HEAD` 的 branch changes。

**In:** base ref validation、merge-base resolution、three-dot-equivalent diff、scope metadata。 **Out:** automatic
base selection、working-tree composition、remote fetching。

**Steps:** separate exact-range and branch-range variants；resolve base/merge-base once；fixture divergent history、
missing merge base、detached HEAD；document difference from `--since`。

**Accept:** base branch tip 前進不會誤納 upstream-only commits；invalid/ref errors typed；Git commands bounded；
CLI flags incompatibility 在 engine call 前失敗。


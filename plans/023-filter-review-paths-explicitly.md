# 023 — Filter review paths explicitly

[← Plan index](./README.md)

**Depends on:** 022。 **Learning:** user selection inside a repository boundary。

**Working state:** repeatable `--path <file-or-dir>` 只保留 scope 內符合的 paths。

**In:** pathspec normalization、file/directory matching、empty-selection behavior、scope metadata。 **Out:** ignore file、
generated/binary policy、glob language、monorepo graph。

**Steps:** 先 canonicalize user input；轉成 repo-relative literal selectors；pure filter after Git discovery；fixtures
for spaces/newlines/pathspec magic/symlink escape。

**Accept:** filters 不能離開 repo root；不把 user text 當 Git pathspec magic；repeat order 不影響結果；空結果
clean skip 且 zero engine calls。


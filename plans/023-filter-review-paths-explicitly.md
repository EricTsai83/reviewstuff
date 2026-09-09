# 023 — Filter review paths explicitly

[← Plan index](./README.md)

**Depends on:** 022。 **Learning:** user selection inside a repository boundary。

**Working state:** repeatable `--path <file-or-dir>` 只保留 scope 內符合的 paths。

**In:** pathspec normalization、file/directory matching、empty-selection behavior、scope metadata。 **Out:** ignore file、
generated/binary policy、glob language、monorepo graph。

**Steps:** 先 canonicalize user input；轉成 repo-relative literal selectors；在 change listing 之後、
patch collection 之前做 pure filter——被過濾掉的檔案不得起任何 `git diff` subprocess，也不進 053 的
size 預檢；fixtures for spaces/newlines/pathspec magic/symlink escape。

**Accept:** filters 不能離開 repo root；不把 user text 當 Git pathspec 傳給 git；repeat order 不影響結果；
空結果 clean skip 且 zero engine calls；有測試以 fake runner 證明被過濾檔案沒有 patch subprocess。

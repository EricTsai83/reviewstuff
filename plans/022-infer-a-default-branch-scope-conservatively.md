# 022 — Infer a default branch scope conservatively

[← Plan index](./README.md)

**Depends on:** 021。 **Learning:** safe defaults under incomplete repository metadata。

**Working state:** 無 scope flag 時，若 remote symbolic HEAD 可可靠解析就 review branch changes + uncommitted；
否則退回 uncommitted 並顯示 warning。

**In:** configured base precedence、remote symbolic HEAD discovery、fallback warning、detached/unborn behavior。
**Out:** network fetch、guessing `main`/`master`、using feature branch upstream as semantic base。

**Steps:** pure decision table；Git metadata operations；fixtures for no remote、stale/missing symbolic HEAD、feature
upstream、detached HEAD；report effective decision。

**Accept:** 不將 feature upstream 誤認 default branch；不連網；fallback 可觀察；explicit flags 永遠勝過 inference。


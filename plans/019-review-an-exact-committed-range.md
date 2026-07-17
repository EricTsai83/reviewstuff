# 019 — Review an exact committed range

[← Plan index](./README.md)

**Depends on:** 018。 **Learning:** immutable Git range semantics。

**Working state:** `--since <ref>` 可 review 已驗證 commit 到 `HEAD` 的 committed diff；`--base-commit` 只是同一
exact-left-endpoint semantics 的清楚 alias。

**In:** commit/ref validation、committed diff source、scope metadata、mutual exclusion with staged-only。
**Out:** merge-base branch semantics、default branch inference、remote fetch。

**Steps:** 擴充 versioned scope；驗證 ref resolves to commit；以 literal argv 讀 diff/status；處理 detached HEAD、
unknown/ambiguous ref、rename/delete fixtures。

**Accept:** exact endpoint 不偷偷改成 merge-base；不自動 fetch；no-change 不呼叫 engine；report/session-ready
metadata 能重現 range。


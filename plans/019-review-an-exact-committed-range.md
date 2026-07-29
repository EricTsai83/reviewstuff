# 019 — Review an exact committed range

[← Plan index](./README.md)

**Depends on:** 018。 **Learning:** immutable Git range semantics。

**Working state:** `--from <ref>` 可 review 已驗證 commit 到 `HEAD` 的 committed diff（exact left endpoint，
不做 merge-base）。

**命名決策：** 不用 `--since`（與 git 的日期語意 `--since=<date>` 衝突），也不提供 `--base-commit` alias
（與 020 的 merge-base `--base` 幾乎同名但語意不同，是 footgun）。exact range 一律 `--from`，merge-base
一律 `--base`，兩者互斥。

**In:** commit/ref validation、committed diff source、scope metadata、mutual exclusion with staged-only。
**Out:** merge-base branch semantics、default branch inference、remote fetch。

**Steps:** 擴充 versioned scope；驗證 ref resolves to commit；以 literal argv 讀 diff/status；處理 detached HEAD、
unknown/ambiguous ref、rename/delete fixtures。

**Accept:** exact endpoint 不偷偷改成 merge-base；不自動 fetch；no-change 不呼叫 engine；report/session-ready
metadata 能重現 range。


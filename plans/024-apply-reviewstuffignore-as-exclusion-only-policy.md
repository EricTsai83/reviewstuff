# 024 — Apply `.reviewstuffignore` as exclusion-only policy

[← Plan index](./README.md)

**Depends on:** 023。 **Learning:** documented ignore semantics。

**Working state:** repo-root `.reviewstuffignore` 可再排除 selected paths，並在 coverage 顯示 stable reason。

**In:** versioned/documented pattern semantics、ordered exclusion rules、config/read error、ignore hash metadata。
**Out:** negation that re-includes hard exclusions、global ignore file、secret redaction。

**Steps:** 選定並記錄 pattern grammar；pure matcher fixtures；Config/File boundary 安全讀取 single root file；
將 exclusion reason 加入 coverage。

**Accept:** ignore 只縮小 selection；invalid syntax 有行號與 typed error；symlinked ignore file policy 明確且有測試；
same file 產生 same policy hash。


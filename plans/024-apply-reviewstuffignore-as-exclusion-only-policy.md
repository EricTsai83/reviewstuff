# 024 — Apply `.reviewstuffignore` as exclusion-only policy

[← Plan index](./README.md)

**Depends on:** 025。 **Learning:** documented ignore semantics。

> 排序說明：本 plan 在 025 之後執行，ignore exclusion 直接掛在 025 的 central selection policy
> 與 coverage reason 基礎設施上，不另建第二套 exclusion 路徑。

**Working state:** repo-root `.reviewstuffignore` 可再排除 selected paths，並在 coverage 顯示 stable reason。

**In:** versioned/documented pattern semantics、ordered exclusion rules、config/read error、ignore hash metadata。
**Out:** negation that re-includes hard exclusions、global ignore file、secret redaction。

**Steps:** 選定並記錄 pattern grammar；pure matcher fixtures；Config/File boundary 安全讀取 single root file；
以 025 的 central selection policy 掛載 exclusion reason（沿用其 coverage reason 語意，不新增平行機制）。

**Accept:** ignore 只縮小 selection；invalid syntax 有行號與 typed error；symlinked ignore file policy 明確且有測試；
same file 產生 same policy hash。


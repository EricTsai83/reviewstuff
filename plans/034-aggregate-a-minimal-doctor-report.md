# 034 — Aggregate a minimal doctor report

[← Plan index](./README.md)

**Depends on:** 033、048。 **Learning:** health contributions without layer leakage。

**Working state:** `reviewstuff doctor [--json]` 聚合 runtime、Git、config、storage、privacy與已註冊 engine availability。

**In:** `DoctorReportV1`、pass/warn/fail/not-available checks、typed contribution contract、exit policy、
重用 048 的 effective-config snapshot 與 secret-safe provenance。
**Out:** analyzer/update/install-channel guesses、paid inference、remote log upload。

**Steps:** 每個 semantic capability提供 side-effect-bounded health contribution；doctor use-case只聚合；credentials缺失
為 warning；config contribution 消費 048 snapshot，不重新 decode/resolve 或複製 precedence；network check只有明確
non-billable endpoint才允許。

**Accept:** no inference/repo upload；warnings exit 0、fail exit 1；JSON stable；command只 render report；尚不存在能力顯示
not-available而非猜測；config health 與 `config show` 對相同 input 報告相同 path、state 與 effective source，
且不輸出 secrets。

# 045 — Document the privacy and security contract

[← Plan index](./README.md)

**Depends on:** 044。 **Learning:** docs as executable product contract。

**Working state:** 使用者可準確理解 local/cloud data flow、request preview、redaction限制、local session內容與 vulnerability
reporting流程。

**In:** privacy/security docs、data-flow table、threat-model summary、redaction residual risk、SECURITY.md。
**Out:** install quickstart、provider setup walkthrough、marketing site、enterprise policy。

**Steps:** 以 013–015、027–029 的實際 schema/data為 source；逐一列出 sent/stored/not-stored data；加入 request preview與
session inspection examples；定義 security report channel與 supported versions。

**Accept:** 清楚說 secret detection非保證；不宣稱 local provider等於零外部風險；privacy內容與 normalized request/session storage
一致；沒有非 v1 feature承諾。


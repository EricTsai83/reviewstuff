# 014 — Redact obvious secrets before engine input

[← Plan index](./README.md)

**Depends on:** 013。 **Learning:** one-way data sanitization pipeline。

**Working state:** diff、paths/context 與 metadata 先經同一 pure redaction pipeline，再進任何 engine。

**In:** bounded secret detectors、stable replacement token、reason/count summary、false-positive fixtures。
**Out:** guaranteed secret detection、custom ignore file、session cleanup、raw prompt persistence。

**Steps:** 定義 redacted request contract；對 request tree 單次 traversal；確保 diagnostics/log 只輸出
reason/count；加入 API key/private key/high-entropy fixtures。

**Accept:** engine fake 可證明未收到原 secret；replacement deterministic；不在 error/debug 回顯 secret；
docs/type naming 不宣稱零洩漏。


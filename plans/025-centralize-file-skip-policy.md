# 025 — Centralize file skip policy

[← Plan index](./README.md)

**Depends on:** 024。 **Learning:** observable conservative input policy。

**Working state:** binary、media、generated、lock、build output 都由單一 selection policy 判斷並回報 stable reason；
不在 Git adapter 或 engine 各自靜默略過。

**In:** hard exclusion vs overridable default、rename/delete location policy、config override、coverage summary。
**Out:** semantic generated detection、provider-specific truncation、language analyzers。

**Steps:** 將現有 binary/large behavior移到 pure selection contract；hard exclude binary/media；其餘 override 仍受
012 budget；補每個 heuristic fixture與 boundary test。

**Accept:** 每個 scope file 恰有一個 final status；override 不繞過 containment/hard cap；rename/delete 不 crash；
human/JSON/request coverage counts 一致。


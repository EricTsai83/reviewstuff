# 012 — Integrate budgeted coverage into review output

[← Plan index](./README.md)

**Depends on:** 011。 **Learning:** one policy result shared across consumers。

**Working state:** `runReview`只把 selected hunks送進 engine，human/JSON report使用同一份 coverage，oversized text diff不再靜默
整檔略過。

**In:** use-case integration、request mapping、coverage renderer、effective budget metadata。 **Out:** session/agent output、
provider-specific truncation、多批 calls。

**Steps:** 在 engine call前執行 selector；禁止 engine二次 silent truncate；report summary使用 scope total；integration fixtures；
boundary test確認 Git/review/engine ownership。

**Accept:** serialized estimate不超 budget；所有 scope files恰有一個 coverage status；request/report數值一致；no selected hunks時
zero engine call或明確 skip policy。


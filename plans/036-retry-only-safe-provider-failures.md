# 036 — Retry only safe provider failures

[← Plan index](./README.md)

**Depends on:** 035。 **Learning:** retry taxonomy and idempotence。

**Working state:** OpenAI engine 對 rate-limit/temporary server errors 使用 bounded backoff；auth、policy、schema、refusal 與
budget 錯誤不 retry。Codex CLI engine 預設不 retry。

**In:** retry classification、attempt cap、`Retry-After` handling、injectable Schedule/Clock、attempt diagnostics、
transport contract 擴充。
**Out:** provider fallback、circuit breaker、pricing、telemetry。

**Transport 契約：** 現有 `OpenAIResponsesTransportResponse` 只有 `status` 與 `body`，沒有 headers。本 plan
把它擴充為只 allowlist `retry-after` 一個 header（parsed 為秒數或 date，超出上限 clamp），其餘 header 不進
contract、不進 error、不進 log。

**Steps:** 先列 error decision table；retry wrapper 放在 `engines/` 內對 `ReviewEngine.review` 的共用 boundary，
依 error tag 分類，而不是各 adapter 各寫一套；wrapper 必須在 use-case 傳入的單一 `timeoutMilliseconds`
內完成所有 attempts；deterministic no-jitter/jitter tests；interruption cancels pending delay。

**Accept:** max attempts 可證明；non-retryable exactly one call；timeout budget 涵蓋所有 attempts；no silent engine switch；
`Retry-After` 以外的 header 不出現在任何型別或輸出。

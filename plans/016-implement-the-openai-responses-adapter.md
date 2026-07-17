# 016 — Implement the OpenAI Responses adapter

[← Plan index](./README.md)

**Depends on:** 015。 **Learning:** structured-output adapter validation。

**Working state:** OpenAI adapter 可用 mocked HTTP/SDK fixtures 將 `ReviewRequestV1` 轉成 Responses API
request，並解析成 normalized findings；尚未接 CLI selection。

**In:** Responses API `text.format` JSON Schema strict output、`store: false`、auth/config、refusal/incomplete/
empty/schema/transport typed errors、timeout/output cap。 **Out:** live CLI wiring、retry、streaming、tool calls。

**Steps:** 以官方 current API contract 定義 boundary；adapter 只收 normalized request；mock completed、
refusal、incomplete 與 non-message output fixtures；邊界再以 Effect schema decode。

**Accept:** contract 無 OpenAI types；API response shape 不被直接信任；tests 不需 credentials；request 不啟用
server-side storage。參考 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)。


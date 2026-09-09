# 037 — Persist provider run metadata

[← Plan index](./README.md)

**Depends on:** 036。 **Learning:** observability without sensitive payloads。

**Working state:** report/session記錄 provider/model/transport、attempt latency/status、usage tokens（若 provider提供）與
unknown-aware cost metadata。

**In:** `ProviderRunMetadataV1`、per-attempt summary、usage mapping、existing raw/resolved config
boundary 內的 optional user pricing fields（同步更新 048 provenance source coverage 與 fixtures）。
本 plan 是 report 進入 persisted 階段後的第一次 bump：必須帶 migration 與 previous-version fixture。
**Out:** hard-coded current prices、remote telemetry、billing dashboard、stats cache。

**Steps:** schema fixture；adapters產生 typed metadata；use-case merge；renderer顯示 concise summary；redaction test所有 debug fields。

**Accept:** unknown usage/cost不當成 0；不保存 request/response body或 headers/secrets；retry attempts可追蹤；fake engine
metadata deterministic。

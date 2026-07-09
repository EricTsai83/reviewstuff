# 028 - Provider Reliability And Cost Controls

## Goal

讓真實 provider 在日常使用中可預測、可診斷、可控成本。

## Working State

完成後每次 AI review 都有 provider metrics、retry policy、budget guardrail、清楚錯誤訊息。

## Scope

包含：

- provider retry/backoff
- rate limit handling
- request/response token accounting when available
- cost estimate metadata
- max input size policy
- prompt/request snapshot redaction
- provider latency/error metrics in session
- fallback to fake or alternate provider when explicitly configured

不包含：

- silent provider fallback by default
- central telemetry upload
- billing integration

## Implementation Steps

1. 定義 `ProviderRunMetadataV1`。
2. 實作 retry/backoff 與 non-retryable error mapping。
3. 建立 token/cost budget settings。
4. oversized diff 給 actionable remediation。
5. session 保存 redacted provider run metadata。

## Verification

```bash
bun run test
./dist/reviewstuff review --engine openai --model <model-id> --json
./dist/reviewstuff findings --json
```

## Acceptance Criteria

- rate limit / auth / timeout / invalid output 錯誤可區分。
- token/cost budget 超限時不呼叫 provider。
- provider metadata 可用於 debug，但不保存 secrets。

## Learning Focus

- production LLM integration 的 reliability controls。
- 成本、latency、debuggability 的邊界。

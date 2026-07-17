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
- token usage 與 optional cost estimate metadata
- max input size policy
- provider debug metadata redaction；完整 prompt/request snapshot persistence 留到 029
- provider latency/error metrics in session
- fallback to fake or alternate provider when explicitly configured

不包含：

- silent provider fallback by default
- central telemetry upload
- billing integration

## Implementation Steps

1. 定義 `ProviderRunMetadataV1`。
2. 只對可安全重試的 idempotent provider request 實作 bounded exponential backoff + jitter，
   尊重 provider retry hint；auth、schema/refusal、budget 與大多數 client errors 不重試。
3. 建立 input/output token budget 與 call-count budget。cost estimate 只有在取得 usage 且有
   明確、versioned pricing source/config 時才輸出；未知價格回 `unknown`，不可硬編易過期價格或當成 0。
4. oversized diff 給 actionable remediation。
5. session 保存 redacted provider run metadata。

## Verification

```bash
bun run test
OPENAI_API_KEY=<key> ./dist/reviewstuff review --engine openai --model <model-id> --json
./dist/reviewstuff review findings --json
```

## Acceptance Criteria

- rate limit / auth / timeout / invalid output 錯誤可區分。
- token/cost budget 超限時不呼叫 provider。
- provider metadata 可用於 debug，但不保存 secrets。
- retry 次數、每次 latency/error、fallback decision 與 pricing source/version 都可追蹤；
  alternate provider 只有 explicit config 才可使用，且不跨越 privacy allowlist。

## Learning Focus

- production LLM integration 的 reliability controls。
- 成本、latency、debuggability 的邊界。

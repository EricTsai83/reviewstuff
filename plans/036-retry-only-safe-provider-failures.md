# 036 — Retry only safe provider failures

[← Plan index](./README.md)

**Depends on:** 035。 **Learning:** retry taxonomy and idempotence。

**Working state:** cloud engine對 rate-limit/temporary server errors使用 bounded backoff；auth、policy、schema、refusal與 budget
錯誤不 retry。Codex local engine預設不 retry。

**In:** retry classification、attempt cap、Retry-After handling、injectable Schedule/Clock、attempt diagnostics。
**Out:** provider fallback、circuit breaker、pricing、telemetry。

**Steps:** 先列 error decision table；把 retry wrapper放 cloud adapter shared boundary；deterministic no-jitter/jitter tests；
interruption cancels pending delay。

**Accept:** max attempts可證明；non-retryable exactly one call；timeout budget涵蓋所有 attempts；no silent engine switch。


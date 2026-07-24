# 017 — Select and run the OpenAI engine

[← Plan index](./README.md)

**Depends on:** 016。 **Learning:** implementation registry and composition root。

**Working state:** `reviewstuff review --engine openai --model <id> --privacy cloud-allowed --json` 可執行；
缺 credentials 時有明確 remediation。

**In:** minimal engine registry、CLI/config selection、OpenAI layer wiring、credential diagnostic、opt-in live smoke。
**Out:** Anthropic、Codex CLI、fallback、retry、doctor aggregation。

**Steps:** registry metadata 只描述已存在 implementations；selection precedence 為 CLI > config > provider
default；App layer 組合；unit/e2e 使用 fake transport；live smoke 明確標示費用與 prerequisite。
把 supported-selection gate 移交 registry：刪除 `use-cases/run-review.ts` 的
`ensureSupportedFakeSelection`（hardcoded fake triple），並把 `ReviewSelectionUnsupportedError` 從
`use-cases/run-review.ts` 搬到 engines（它是 engine capability error，不是 config parsing error）；
use-case 只呼叫 registry 解析出的 engine。

**Accept:** fake 仍為 deterministic default；缺 key 不 crash/不印 key；`local-only` 在 transport 前拒絕；
live smoke 不是一般 test gate。

# 009 - Additional Provider Adapters

## Goal

在 008 已穩定的 `ReviewEngine` contract 上，加入 Anthropic 與 Codex CLI/local provider。

## Working State

完成後可以執行：

```bash
reviewstuff review --engine anthropic --model <model-id> --json
reviewstuff review --engine codex-cli --model <model-id> --json
```

## Scope

包含：

- `src/engines/anthropic-review-engine.ts`
- `src/engines/codex-cli-review-engine.ts`
- provider capability metadata
- provider-specific credential diagnostics
- local CLI executable discovery
- local CLI subprocess timeout/output cap

不包含：

- silent provider fallback
- retry/backoff/cost controls
- provider streaming UI
- OAuth
- installing provider CLIs

## Implementation Steps

1. 擴充 provider registry，讓 provider metadata 可被 CLI 和 doctor 共用。
2. 實作 Anthropic adapter，輸入只接受 `ReviewRequestV1`。
3. 實作具名的 `CodexCliReviewEngine` layer，所有 subprocess 只透過注入的 `CommandRunner`；
   `ReviewEngine` contract 與 review use-case 不暴露 command/platform types。
4. 將 provider-specific errors 映射成共同 `ReviewEngineError`。
5. doctor 顯示 Anthropic credentials 和 local CLI availability。

## Verification

```bash
bun run test
ANTHROPIC_API_KEY=<key> ./dist/reviewstuff review --engine anthropic --model <model-id> --json
./dist/reviewstuff review --engine codex-cli --model <model-id> --json
./dist/reviewstuff doctor --json
```

## Acceptance Criteria

- Anthropic、Codex CLI、OpenAI 都走同一個 `ReviewEngine` contract。
- local CLI provider 不直接讀寫 repo，只透過 normalized request。
- local CLI subprocess 有 timeout、output limit、exit-code mapping。
- 只有 local CLI provider adapter 依賴 `CommandRunner`，不得直接使用
  `@effect/platform/Command` 或 shell string。
- credentials 或 executable 缺失時有可行 remediation。
- fake engine 行為不回歸。

## Learning Focus

- 用同一個 domain contract 接多個 provider。
- cloud API provider 與 local CLI provider 的差異。
- provider registry 如何支撐 CLI selection 和 doctor diagnostics。

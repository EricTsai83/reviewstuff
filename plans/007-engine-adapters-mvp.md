# 007 - Engine Adapters MVP

## Goal

建立 review engine 邊界，先把 deterministic reviewer 從 review use-case 中抽出。

## Working State

完成後 deterministic engine 是唯一可執行 engine，而未來 provider adapter 有明確落點。

## Scope

包含：

- `src/engines/review-engine.ts`
- `src/engines/deterministic-review-engine.ts`
- timeout/retry/error mapping
- structured output schema parsing

不包含：

- 真實 provider invocation
- OAuth 完整產品化
- session storage
- deep review agent

## Implementation Steps

1. 在 `review-engine.ts` 定義 `ReviewEngine` interface。
2. 定義 `EngineSelection`：`engine`、`provider`、`model`、`transport`。
3. `deterministic-review-engine.ts` 回傳 deterministic findings，供目前 CLI 與測試使用。
4. engine request/response 使用 versioned schema。
5. engine call 有 timeout 與 output size limit，即使 deterministic engine 也走同一條路徑。
6. 不建立 provider skeleton 或 registry；等 008 出現第二個真實 implementation 時再加入 selection/composition。

## Engine Selection

```ts
interface EngineSelectionV1 {
  engine: "fake" | "openai" | "anthropic" | "codex-cli" | "custom"
  provider: string
  model: string
  transport: "cloud-api" | "local-cli"
}
```

`model` 是 provider-specific string，core 不 hard-code 模型名稱；只負責傳遞、記錄、驗證非空。

## Verification

```bash
bun run test
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --json
```

## Acceptance Criteria

- fake engine deterministic。
- provider failure 不會 crash 整個 review。
- provider/model selection 有清楚 precedence：CLI flag > config > default。
- structured output parse 失敗會被清楚回報。

## Learning Focus

- Interface boundary vs implementation。
- 用 fake dependency 測 use-case。
- typed error mapping。

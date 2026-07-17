# 007 - Engine Adapters MVP

## Goal

建立 review engine 邊界，先把 deterministic reviewer 從 review use-case 中抽出。

## Working State

完成後 deterministic engine 是唯一可執行 engine，而未來 provider adapter 有明確落點。

## Scope

包含：

- `src/engines/review-engine.ts`
- `src/engines/deterministic-review-engine.ts`
- timeout/output-limit/error mapping
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
4. engine request/response 使用 versioned schema；在這裡先定義 normalized `ReviewFindingV1`
   （包含後續 provider 需要的 severity/category/confidence 等欄位），並把 005 的 deterministic
   finding/report 升版映射到同一 schema。補舊 report fixture decode/migration/refusal test，避免
   008 才一邊接 provider 一邊改 public finding contract。
5. engine call 有 timeout 與 output size limit，即使 deterministic engine 也走同一條路徑。
6. 不建立 provider skeleton 或 registry；等 008 出現第一個 provider implementation
   （也就是 fake 之後的第二個 `ReviewEngine` implementation）時再加入
   selection/composition。retry/backoff 留到 028，避免在沒有真實 failure mode 前先做策略。

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
./dist/reviewstuff review --engine fake --json
```

## Acceptance Criteria

- fake engine deterministic。
- engine failure 不會 crash 整個 review。
- provider/model selection 有清楚 precedence：CLI flag > config > default。
- structured output parse 失敗會被清楚回報。
- fake 與未來 provider 共用同一 normalized finding schema；005 report fixture 有明確相容路徑。

## Learning Focus

- Interface boundary vs implementation。
- 用 fake dependency 測 use-case。
- typed error mapping。

# 007 - Engine Adapters MVP

## Goal

建立 review engine 邊界，先把 deterministic reviewer 從 review use-case 中抽出。

## Working State

完成後 fake engine 是唯一可執行 engine，但 provider adapter 有明確落點。

## Scope

包含：

- `src/engines/engine.ts`
- `src/engines/fake.ts`
- provider adapters skeleton：`claude`、`codex`
- timeout/retry/error mapping
- structured output schema parsing

不包含：

- 真實 provider invocation
- OAuth 完整產品化
- session storage
- deep review agent

## Implementation Steps

1. 定義 `ReviewEngine` interface。
2. fake engine 回傳 deterministic findings。
3. provider adapter skeleton 回傳清楚的 not-configured typed error。
4. engine request/response 使用 versioned schema。
5. engine call 有 timeout 與 output size limit，即使 fake engine 也走同一條路徑。

## Verification

```bash
bun run test
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --json
```

## Acceptance Criteria

- fake engine deterministic。
- provider failure 不會 crash 整個 review。
- structured output parse 失敗會被清楚回報。

## Learning Focus

- Interface boundary vs implementation。
- 用 fake dependency 測 use-case。
- typed error mapping。

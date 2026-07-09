# 007 - Engine Adapters MVP

## Goal

建立 review engine 邊界，讓 fake engine、provider CLI、未來 API provider 都能掛上同一個介面。

## Working State

完成後 fake engine 仍是測試預設；有 credentials/provider CLI 時可以跑真實 AI review。

## Scope

包含：

- `src/engines/engine.ts`
- `src/engines/fake.ts`
- provider adapters skeleton：`claude`、`codex`、`pi`
- timeout/retry/error mapping
- structured output schema parsing

不包含：

- OAuth 完整產品化
- session storage
- deep review agent

## Implementation Steps

1. 定義 `ReviewEngine` interface。
2. fake engine 回傳 deterministic findings。
3. provider adapter 輸入 unified request，輸出 structured findings。
4. 所有 provider 錯誤轉成 typed errors。
5. 每個 engine call 有 timeout 與 output size limit。

## Verification

```bash
bun run test
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --json
```

Optional live smoke:

```bash
reviewstuff review --staged --engine claude
```

## Acceptance Criteria

- fake engine deterministic。
- provider failure 不會 crash 整個 review。
- structured output parse 失敗會被清楚回報。

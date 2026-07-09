# 006 - Config Profiles

## Goal

加入 config 與最小 profile 機制，讓 review 行為開始可以被設定控制。

## Working State

完成後可以用 `reviewstuff.config.json` 控制預設 profile、engine、provider、model、timeout、concurrency。

## Scope

包含：

- `src/config/schema.ts`
- `src/config/service.ts`
- versioned config schema
- profiles：`quick`、`standard`
- default engine/provider/model selection
- config error rendering

不包含：

- real provider calls
- multi-language adapters
- reviewer prompt registry
- prompt replay command
- `thorough` profile

## Implementation Steps

1. 定義 versioned config schema。
2. 實作 config loading 與 validation。
3. 建立 `quick`、`standard` 兩個 profile。
4. review use-case 根據 config/profile 決定 engine/provider/model、timeout/concurrency 與 fake reviewer behavior。
5. config 錯誤轉成 usage error，不印 stack trace。

## Config Shape

最小 config 先支援：

```json
{
  "schemaVersion": 1,
  "review": {
    "profile": "standard",
    "engine": "fake",
    "provider": "fake",
    "model": "fake-reviewer-v1",
    "timeoutMs": 120000,
    "concurrency": 2
  }
}
```

CLI flags 優先於 config，例如 `--engine openai --model <model-id>`。

## Verification

```bash
bun run typecheck
bun run test
./dist/reviewstuff review --profile quick --json
./dist/reviewstuff review --engine fake --model fake-reviewer-v1 --json
```

## Acceptance Criteria

- 無 config 時使用安全預設值。
- config error 有清楚 message。
- profile 與 engine/provider/model resolution 可單元測試。

## Learning Focus

- Effect schema / validation。
- config defaults 與 usage error mapping。

# 006 - Config Profiles

> Historical contract: this plan intentionally records the shipped config v1
> `profile: "quick" | "standard"` behavior. Plan 026 replaces that terminology
> with the `workload` contract. The current implementation later removed the
> user-authored config's `schemaVersion`; do not rewrite this completed plan as
> though that later design existed here.

## Goal

加入 config 與最小 profile 機制，讓 review 行為開始可以被設定控制。

## Working State

完成後可以用 `reviewstuff.config.json` 控制預設 profile、engine、provider、model、timeout、concurrency。

## Scope

包含：

- `src/config/schema.ts`
- `src/config/config-service.ts`
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
2. 在 `config/config-service.ts` 定義不暴露 filesystem/platform types 的
   `ConfigService` contract，並在同一 canonical module 透過 platform filesystem
   實作 loading 與 `layer`；use-case tests 在測試附近建立 fake layer。
3. 建立 `quick`、`standard` 兩個 profile。
4. review use-case 只透過 `ConfigService` 根據 config/profile 決定
   engine/provider/model、timeout/concurrency 與 fake reviewer behavior。
5. command/output layer 將 typed config error render 成 usage error，不印 stack trace。

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
- review use-case 不直接依賴 filesystem、platform service 或 renderer。

## Learning Focus

- Effect schema / validation。
- config defaults 與 usage error mapping。

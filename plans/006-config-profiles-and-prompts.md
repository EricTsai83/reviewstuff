# 006 - Config Profiles And Prompts

## Goal

加入 config、profiles、reviewer prompt registry，讓 review 行為可以被設定控制。

## Working State

完成後可以用 `reviewstuff.config.json` 控制 reviewers、profiles、timeout、concurrency。

## Scope

包含：

- `src/config/schema.ts`
- `src/config/service.ts`
- `src/prompts/reviewers/`
- reviewer registry
- profiles：`quick`、`standard`、`thorough`

不包含：

- real provider calls
- multi-language adapters
- prompt replay command

## Implementation Steps

1. 定義 versioned config schema。
2. 實作 config loading 與 validation。
3. 建立 reviewer ids：`correctness`、`security`、`architecture`、`performance`、`typescript`、`framework`。
4. prompt registry 只負責 prompt text，不跑模型。
5. review use-case 根據 config/profile 決定 reviewers。

## Verification

```bash
bun run typecheck
bun run test
./dist/reviewstuff review --staged --profile quick --json
./dist/reviewstuff review --staged --reviewers correctness,security --json
```

## Acceptance Criteria

- 無 config 時使用安全預設值。
- config error 有清楚 message。
- prompt registry 可單元測試。

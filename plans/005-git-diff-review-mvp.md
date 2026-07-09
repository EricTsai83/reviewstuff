# 005 - Git Diff Review MVP

## Goal

做出第一個可工作的本機 review：讀 git diff，產生 deterministic report。

## Working State

完成後可以執行：

```bash
reviewstuff review --staged
reviewstuff review --staged --json
```

這階段不呼叫 AI，只用 fake/deterministic reviewer 驗證整條 pipeline。

## Scope

包含：

- `src/git/service.ts`
- `src/domain/scope.ts`
- `src/domain/finding.ts`
- `src/domain/report.ts`
- `src/use-cases/run-review.ts`
- terminal/json output
- staged diff reading
- minimal changed file filtering
- git subprocess 透過 `src/platform/command-runner.ts`，不得直接使用 `child_process`、`Bun.spawn` 或 shell string

不包含：

- `--since <ref>`
- full working tree scope
- real provider engine
- session storage
- fix workflow

## Implementation Steps

1. 實作 git repo detection。
2. 支援第一個 scope：`--staged`。
3. 讀 staged changed files 與 unified diff。
4. deterministic reviewer 對特定 marker 產生 finding，例如 `REVIEWSTUFF_FAKE_FINDING`。
5. 產生 versioned report。

## Verification

```bash
bun run test
bun run build
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --json
```

## Acceptance Criteria

- 非 git repo 回傳 usage exit code。
- 無變更時 clean exit。
- 有 marker diff 時產生 finding。
- JSON output 穩定、可測。
- git command timeout、output limit、exit-code mapping 有測試覆蓋。

## Learning Focus

- 用 Effect use-case 編排第一條完整 pipeline。
- 透過 command runner 受控執行 `git`。
- 先用 deterministic reviewer 驗證資料流，不引入 AI 變因。

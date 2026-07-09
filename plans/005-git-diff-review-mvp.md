# 005 - Git Diff Review MVP

## Goal

做出第一個可工作的本機 review：讀 git diff，產生 deterministic report。

## Working State

完成後可以執行：

```bash
reviewstuff review --staged
reviewstuff review --since main
reviewstuff review --json
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
- changed file filtering

不包含：

- real provider engine
- session storage
- fix workflow

## Implementation Steps

1. 實作 git repo detection。
2. 支援 scopes：`--staged`、`--since <ref>`、working tree default。
3. 讀 changed files 與 unified diff。
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

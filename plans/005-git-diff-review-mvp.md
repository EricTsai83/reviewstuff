# 005 - Git Diff Review MVP

## Goal

做出第一個可工作的本機 review：讀 git diff，產生 deterministic report。

## Working State

完成後可以執行：

```bash
reviewstuff review
reviewstuff review --json
reviewstuff review --staged
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
- default working tree diff reading，包括 staged、unstaged tracked、untracked text files
- optional staged diff reading
- minimal changed file filtering
- git subprocess 透過 `src/platform/command-runner.ts`，不得直接使用 `child_process`、`Bun.spawn` 或 shell string

不包含：

- `--since <ref>`
- branch-vs-base committed changes
- real provider engine
- session storage
- fix workflow

## Implementation Steps

1. 實作 git repo detection。
2. 支援預設 scope：working tree changes，也就是 staged + unstaged tracked changes + untracked text files。
3. 支援 optional scope：`--staged` 只 review index。
4. deterministic reviewer 對特定 marker 產生 finding，例如 `REVIEWSTUFF_FAKE_FINDING`。
5. 產生 versioned report。

## Verification

```bash
bun run test
bun run build
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --json
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --json
```

## Acceptance Criteria

- 非 git repo 回傳 usage exit code。
- 無變更時 clean exit。
- 有 marker diff 時產生 finding。
- 預設不要求 `git add`。
- 預設會納入 untracked text files，並略過 binary/large files。
- JSON output 穩定、可測。
- git command timeout、output limit、exit-code mapping 有測試覆蓋。

## Learning Focus

- 用 Effect use-case 編排第一條完整 pipeline。
- 透過 command runner 受控執行 `git`。
- 先用 deterministic reviewer 驗證資料流，不引入 AI 變因。

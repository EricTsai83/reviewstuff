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
- `src/git/live.ts`
- `src/domain/scope.ts`
- `src/domain/finding.ts`
- `src/domain/report.ts`
- `src/use-cases/run-review.ts`
- `src/platform/command-runner-live.ts`
- terminal/json output
- default working tree diff reading，包括 staged、unstaged tracked、untracked text files
- optional staged diff reading
- minimal changed file filtering
- 完成 004 定義的 `CommandRunner` Bun live adapter：timeout、combined output
  limit、stdout/stderr、exit code、cancellation cleanup
- Git live adapter 只透過 `CommandRunner` 執行 git，不得直接使用
  `@effect/platform/Command`、`child_process`、`Bun.spawn` 或 shell string

不包含：

- `--since <ref>`
- branch-vs-base committed changes
- real provider engine
- session storage
- fix workflow

## Implementation Steps

1. 使用 `@effect/platform/Command.start` 實作 `CommandRunner` live adapter；並行消耗
   stdout/stderr、streaming 計算 combined byte limit、timeout/cancellation 時中止並清理
   process，將 platform failure 映射成 004 定義的 tagged errors。
2. 定義不暴露 `CommandRunner` 或 platform types 的 `GitService` contract；
   `GitServiceLive` 依賴 `CommandRunner`，`runReview` 只依賴 `GitService`。
3. 實作 git repo detection。
4. 支援預設 scope：working tree changes，也就是 staged + unstaged tracked changes + untracked text files。
5. 支援 optional scope：`--staged` 只 review index。
6. deterministic reviewer 對特定 marker 產生 finding，例如 `REVIEWSTUFF_FAKE_FINDING`。
7. 產生 versioned report，並由 command 選擇 human/JSON renderer。

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
- `runReview` 的 dependency type 不包含 `CommandRunner`、platform service 或 renderer。
- command runner 的 stdout/stderr concurrent drain、timeout、combined output limit、
  non-zero exit result、spawn failure 與 interruption cleanup 有 deterministic 測試。
- Git adapter 將 command exit code/runner error 映射成 Git-specific tagged error，且有測試覆蓋。

## Learning Focus

- 用 Effect use-case 編排第一條完整 pipeline。
- 透過 command runner 受控執行 `git`。
- 先用 deterministic reviewer 驗證資料流，不引入 AI 變因。

# 022 - Review Scopes

## Goal

補齊日常 code review 需要的 diff scope，讓預設行為符合「review 目前 branch 的變更」。

## Working State

完成後可以執行：

```bash
reviewstuff review
reviewstuff review --dir ../repo
reviewstuff review --type uncommitted
reviewstuff review --type committed
reviewstuff review --light
reviewstuff review --fast
reviewstuff review --base main
reviewstuff review --base-commit <commit>
reviewstuff review --since main
reviewstuff review --working-tree
reviewstuff review --staged
```

## Scope

包含：

- default current branch scope
- `--dir <path>`
- `--type all|committed|uncommitted`
- `--base <branch>`
- `--base-commit <commit>`
- `--since <ref>`
- `--working-tree`
- `--staged`
- `--fast` / `--light`
- untracked file handling
- no-change skip behavior

不包含：

- GitHub PR comments
- remote branch fetching
- path filters
- binary/generated/large file skip policy
- rename/delete file handling
- monorepo package graph analysis

## Implementation Steps

1. 擴充 `ReviewScopeV1`。
2. 實作 `--dir <path>`，切換 review root，但目標必須是 initialized git repo。
3. 實作 default current branch detection：優先 upstream/default base，fallback working tree。
4. 實作 `git merge-base` / `git diff <base>...HEAD` flow，並合併 working tree changes 和 untracked text files。
5. 實作 `--type all|committed|uncommitted` 對應 committed branch diff、working tree diff、或兩者合併。
6. 實作 `--base-commit <commit>` 與 `--since <ref>`。
7. 實作 `--fast` / `--light` policy，降低 context size、tool depth、provider budget。
8. no changes 時不呼叫 provider，agent mode 輸出 `review_context`、`review_skipped` status、`complete`。
9. report/session 記錄 scope metadata。

## Verification

```bash
bun run test
./dist/reviewstuff review --json
./dist/reviewstuff review --dir . --json
./dist/reviewstuff review --type uncommitted --json
./dist/reviewstuff review --type committed --json
./dist/reviewstuff review --light --json
./dist/reviewstuff review --fast --json
./dist/reviewstuff review --base main --json
./dist/reviewstuff review --base-commit HEAD~1 --json
./dist/reviewstuff review --since main --json
./dist/reviewstuff review --working-tree --json
./dist/reviewstuff review --staged --json
```

## Acceptance Criteria

- default/current-branch/type/staged/since/base-commit/working-tree scopes 行為清楚且可測。
- `--dir` 不允許 escape 到非 git repo 或模糊 root。
- `reviewstuff review` 不要求使用者先 `git add`。
- untracked files 有明確 include/skip policy。
- no changes 時不呼叫 provider。
- `--fast` 與 `--light` 有相同行為，且有可觀察的較小 request budget。
- agent no-change stream 有完整 context/status/complete events。

## Learning Focus

- Git diff scope modeling。
- production CLI 的 predictable input selection。

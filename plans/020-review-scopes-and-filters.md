# 020 - Review Scopes And Filters

## Goal

補齊日常 code review 需要的 diff scope，讓預設行為符合「review 目前 branch 的變更」。

## Working State

完成後可以執行：

```bash
reviewstuff review
reviewstuff review --light
reviewstuff review --base main
reviewstuff review --since main
reviewstuff review --working-tree
reviewstuff review --staged
reviewstuff review --path src --path packages
```

## Scope

包含：

- default current branch scope
- `--base <branch>`
- `--since <ref>`
- `--working-tree`
- `--staged`
- `--light`
- path filters
- untracked file handling
- binary/generated/large file skip policy
- rename/delete file handling
- no-change skip behavior

不包含：

- GitHub PR comments
- remote branch fetching
- monorepo package graph analysis

## Implementation Steps

1. 擴充 `ReviewScopeV1`。
2. 實作 default current branch detection：優先 upstream/default base，fallback working tree。
3. 實作 `git merge-base` / `git diff <base>...HEAD` flow，並合併 working tree changes 和 untracked text files。
4. 實作 path filters 與 skip reasons。
5. 實作 `--light` policy，降低 context size、tool depth、provider budget。
6. no changes 時不呼叫 provider，agent mode 輸出 `review_skipped`。
7. report/session 記錄 scope metadata。

## Verification

```bash
bun run test
./dist/reviewstuff review --json
./dist/reviewstuff review --light --json
./dist/reviewstuff review --base main --json
./dist/reviewstuff review --since main --json
./dist/reviewstuff review --working-tree --json
./dist/reviewstuff review --staged --path src --json
```

## Acceptance Criteria

- default/current-branch/staged/since/working-tree scopes 行為清楚且可測。
- `reviewstuff review` 不要求使用者先 `git add`。
- untracked files 有明確 include/skip policy。
- no changes 時不呼叫 provider。
- `--light` 有可觀察的較小 request budget。
- large/generated/binary files 不會撐爆 provider context。
- skipped files 在 report 中可見。

## Learning Focus

- Git diff scope modeling。
- production CLI 的 predictable input selection。

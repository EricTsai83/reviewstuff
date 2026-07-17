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
3. 實作 default current branch detection：優先明確 config 的 base，其次 repository remote
   default branch（例如 remote symbolic `HEAD`）；不要把 current feature branch 的 upstream
   誤當 semantic base。無法可靠判定 base 時 fallback working tree 並輸出 scope warning，且不
   自動 fetch remote。
4. `--base <branch>` 使用 merge-base / three-dot semantics 取得 branch committed changes，再依
   type 合併 working tree changes 和 untracked text files。
5. 明確定義 `--type`：`committed` 只含選定 base/range 到 `HEAD`，`uncommitted` 只含
   staged + unstaged tracked + untracked，`all` 是兩者去重後聯集。
6. `--base-commit <commit>` 將已驗證的 commit object 當 exact left endpoint；`--since <ref>`
   接受可解析 ref 並使用相同 exact-left-endpoint semantics。兩者是不同輸入驗證的相容介面，
   且與 `--base` 互斥。
7. 實作 `--fast` / `--light` policy，降低 context size、tool depth、provider budget。
8. no changes 時不呼叫 provider，agent mode 輸出 `review_context`、`review_skipped` status、`complete`。
9. report/session 記錄 scope metadata。
10. 定義 flags compatibility matrix：`--staged` / `--working-tree` 是 uncommitted scope 的
    shortcuts，和 committed-only/base range 的矛盾組合在 provider 執行前回 usage error。
11. 022 至少要能安全表示 rename/delete；完整 include/skip reason 與 finding location policy
    留到 023，但不得因這兩種 change type crash 或讀取不存在路徑。

## Verification

```bash
bun run test
./dist/reviewstuff review --engine fake --json
./dist/reviewstuff review --engine fake --dir . --json
./dist/reviewstuff review --engine fake --type uncommitted --json
./dist/reviewstuff review --engine fake --type committed --json
./dist/reviewstuff review --engine fake --light --json
./dist/reviewstuff review --engine fake --fast --json
./dist/reviewstuff review --engine fake --base main --json
./dist/reviewstuff review --engine fake --base-commit HEAD~1 --json
./dist/reviewstuff review --engine fake --since main --json
./dist/reviewstuff review --engine fake --working-tree --json
./dist/reviewstuff review --engine fake --staged --json
```

## Acceptance Criteria

- default/current-branch/type/staged/since/base-commit/working-tree scopes 行為清楚且可測。
- `--dir` 可指向任意明確的 initialized git repo；先 canonicalize 選定 repo root，之後所有
  paths 都 containment 在該 root，不沿用原 cwd 當隱含 boundary。
- `reviewstuff review` 不要求使用者先 `git add`。
- untracked files 有明確 include/skip policy。
- no changes 時不呼叫 provider。
- `--fast` 與 `--light` 有相同行為，且有可觀察的較小 request budget。
- agent no-change stream 有完整 context/status/complete events。
- default base 不會把 feature branch upstream 誤判成 repository default branch；detached HEAD、
  missing remote、invalid/ambiguous ref 與互斥 flags 都有 fixture test。

## Learning Focus

- Git diff scope modeling。
- production CLI 的 predictable input selection。

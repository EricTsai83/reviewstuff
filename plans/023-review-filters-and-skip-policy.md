# 023 - Review Filters And Skip Policy

## Goal

在 022 的 scope selection 穩定後，補齊 path filters 與 skipped file reporting，避免 provider context 被不該 review 的內容撐爆。

## Working State

完成後可以執行：

```bash
reviewstuff review --path src --path packages
reviewstuff review --json
```

report/session 會列出 included files 和 skipped files。

## Scope

包含：

- `--path <path>` repeatable path filters
- binary/generated/large file skip policy
- lock file/build output/media file defaults
- rename/delete file handling
- skipped file reasons in report/session
- override hooks in config

不包含：

- monorepo package graph analysis
- semantic diff
- language server indexing
- remote branch fetching

## Implementation Steps

1. 定義 `ReviewFileSelectionV1`，記錄 included/skipped files 與 reason。
2. 實作 repeatable `--path` filters，支援檔案與目錄。
3. 實作 default skip policy：binary、large、generated、lock files、build outputs、media files。
   binary/media 在 v1 是 hard exclusion；large/generated/lock/build defaults 才可透過明確 config
   override，且仍受 request hard cap。不要只依 filename 就把疑似 generated source 靜默略過，
   每條 heuristic 都要有 stable reason 與 fixture。
4. 實作 rename/delete handling，讓 finding location 和 diff metadata 不混亂。
5. 將 skipped file summary 寫入 human report、JSON output、session metadata。
6. 提供 config override，但預設仍保守。

## Verification

```bash
bun run test
./dist/reviewstuff review --engine fake --path src --json
./dist/reviewstuff review --engine fake --json
```

## Acceptance Criteria

- path filters 可重複指定且可測。
- large/generated/binary files 不會進 provider request。
- skipped files 在 report/session 中可見，且 reason 穩定。
- rename/delete file 不造成 crash 或 invalid finding location。
- config override 不會繞過 repo-root containment。
- path filter canonicalization 拒絕 symlink escape；binary/media hard exclusion 不可被一般 override 繞過。

## Learning Focus

- input selection 與 provider budget 的關係。
- 為什麼 production CLI 要把 skipped files 視為可觀察資料，而不是靜默忽略。

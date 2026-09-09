# 019 — Review an exact committed range

[← Plan index](./README.md)

**Depends on:** 018、053。 **Learning:** immutable Git range semantics，以及一次定義完整的 scope contract。

**Working state:** `--from <ref>` 可 review 已驗證 commit 到 `HEAD` 的 committed diff（exact left endpoint，
不做 merge-base）。`reviewstuff review` 與 `--staged` 的行為與輸出語意不變，只有 scope 的序列化形狀升級。

**命名決策：** 不用 `--since`（與 git 的日期語意 `--since=<date>` 衝突），也不提供 `--base-commit` alias
（與 020 的 merge-base `--base` 幾乎同名但語意不同，是 footgun）。exact range 一律 `--from`，merge-base
一律 `--base`，兩者互斥。

## Scope Contract（019–022 共用，本 plan 一次定義完整）

依 README 的刻意例外，本 plan 必須定義 019–022 全部會用到的 scope 形狀，後續三個 plan 只填入行為、
不再 bump report/request schema。現有 `ReviewScope`（`src/domain/scope.ts`）是
`"working-tree" | "staged"` 字串，同時嵌在 `ReviewRequestV1` 與 `ReviewReportV7`；本 plan 把它換成：

```ts
type GitObjectId = string // full SHA-1 或 SHA-256，沿用 parseGitObjectId 的 pattern

type ReviewCommittedRange =
  | {
      readonly kind: "exact"
      readonly fromRef: string      // 使用者輸入，只作顯示
      readonly from: GitObjectId    // 已解析，能重現 range
      readonly to: GitObjectId      // 019 固定為 HEAD 的 object id
    }
  | {
      readonly kind: "merge-base"   // 020 填入行為
      readonly baseRef: string
      readonly mergeBase: GitObjectId
      readonly to: GitObjectId
    }

type ReviewBaseOrigin = "cli" | "config" | "inferred-remote-head" // 022 填入後兩者

type ReviewUncommittedScope = "none" | "staged" | "working-tree"

interface ReviewScopeV2 {
  readonly committed?: ReviewCommittedRange
  readonly baseOrigin?: ReviewBaseOrigin  // 與 committed 同時存在或同時缺席
  readonly uncommitted: ReviewUncommittedScope
}
```

Invariants（以 Schema filter 強制）：`committed` 缺席時 `uncommitted` 不得是 `none`；`committed` 與
`baseOrigin` 必須同時存在或同時缺席。既有值的對應：`"working-tree"` →
`{ uncommitted: "working-tree" }`、`"staged"` → `{ uncommitted: "staged" }`。

`ReviewFileSource` 新增 `committed`。`source` 的語意固定為「patch 新側來自哪裡」：`committed` 是
range 右端 commit、`staged` 是 index、`working-tree` 是工作樹、`untracked` 是尚未追蹤的檔案；舊側一律由
`scope.committed` 描述（缺席時為 `HEAD`）。這讓 021 的組合不需要對同一路徑產生兩份 patch。

本 plan 只實作 `kind: "exact"`、`baseOrigin: "cli"`、`uncommitted: "none"`；`--from` 與 `--staged` 併用在
021 之前是 usage error。Schema 與 decoder 必須接受完整 union 並有 fixture，CLI 不暴露未實作的 flag。

## In / Out

**In:** scope contract 與 schema bump（report、request 各一次，依 README pre-persistence 規則不寫
migration）、commit/ref validation、committed diff source、`GitService.readDiff` 接受新 scope、
scope metadata 進 report/request、`--from` 與 `--staged` 互斥。
**Out:** merge-base branch semantics（020）、與 uncommitted 的組合（021）、default base inference（022）、
remote fetch、path filters。

## Steps

1. Pure 層：新 scope schema、fixtures、`ReviewFileSource` 加 `committed`；更新 report/request 版本與
   renderer，既有 e2e 只需改 scope 的序列化形狀。
2. Git 層：`rev-parse --verify <ref>^{commit}` 驗證 `--from`，解析 `HEAD` 為 object id，
   `diff <from> <to>` 以 literal argv 列出變更並沿用 053 之後的 per-file 收集。
3. CLI：`--from` flag、互斥檢查在 engine call 前失敗、human/JSON 顯示 range。
4. Fixtures：detached HEAD、unknown/ambiguous ref、`--from` 等於 `HEAD`（no-change 零 engine call）、
   rename/delete/typechange 在 range 內。

## Accept

- exact endpoint 不偷偷改成 merge-base；不自動 fetch；no-change 不呼叫 engine。
- report/request 內的 `from`/`to` 是已解析 object id，能重現 range；`fromRef` 只作顯示。
- 完整 scope union 有 decode fixture，未實作的 variant 不能經由 CLI 產生。
- 效能：在含數百個檔案的 range 上量測一次（可用 fixture repo 產生），記錄每檔一個 `git diff` 加
  `--find-copies-harder` 的實際耗時，結果寫進 plan 完成備註供 020 判斷是否需要改為每 source 一次
  diff；本 plan 不做該優化。

# 050 — Harden Git diff collection

[← Plan index](./README.md)

**Depends on:** 026。 **Learning:** real-world Git diff shapes as first-class inputs。

> 排序說明：本 plan 插在 048 之前。以下全部是現行 code 就會失敗的 bug，不是未實作的功能；
> 019–022 之後 scope 會變寬（committed range、branch、composed scope），撞到這些形狀的機率
> 只會上升。Plan 005/014 已 DONE，這些修復不屬於任何既有 plan 的 scope，因此獨立成 050–052
> 三個 hardening plan（依 semantic boundary 拆：git / redaction / engine）。

**Working state:** typechange、copy/rename-with-modified-source、embedded repository，以及非預設 user
diff config 之下，`reviewstuff review` 都能完成並如實回報該檔案，而不是整個 review 失敗。

## In Scope

- **Multi-record diff 解析。** `parseUnifiedDiff`（`src/git/unified-diff-parser.ts:161-165`）目前假設輸入
  恰好是一個 file record，多於一個就丟 `GitInvalidOutputError`。改為以 `diff --git ` 邊界切分並回傳
  多個 records；`readDiffPatch`（`src/git/git-diff.ts:238-255`）從結果中挑出 target 對應的 record(s)。
  修復兩個實測可重現的整體失敗：(1) typechange（`T`，例如檔案 → symlink）單一 pathspec 會產出
  兩個 record（delete + create）；(2) copy/rename 的 source 同時被修改時，`...target.pathspecs`
  同時撈回 source 與 target 兩個 record。
- **Embedded repository。** 過濾 `git ls-files --others` 輸出中的目錄項（結尾為 `/`，
  `src/git/git-service.ts:234-250`）。目前會對 embedded repo 目錄跑 `diff --no-index`／`hash-object`
  而失敗。
- **重複計數。** `git rm --cached <path>` 之後同一個 path 同時出現在 tracked `D` 與 untracked `A`
  （`src/git/git-service.ts:322-355`），該檔案被計兩次。在 collect 之前依 path 去重，並在本 plan
  明文記錄「一個 path 在單次 scope collection 中最多一筆 change」的 invariant；021 重整 scope
  composition 時沿用同一 invariant，不另行定義。
- **Git 執行環境釘住。** `gitCommandArguments`（`src/git/git-command.ts:30`）加上
  `-c diff.suppressBlankEmpty=false`：使用者若設 `diff.suppressBlankEmpty=true`，空白 context 行會
  變成空字串，`unified-diff-parser.ts:76-85` 無法解析而整體失敗。同時 unset `GIT_DIR`、
  `GIT_WORK_TREE`、`GIT_INDEX_FILE`（避免繼承的環境把 `--dir` 指定的 repository 導向別處），
  並設 `GIT_OPTIONAL_LOCKS=0`。
- **小項（同一區域，一併處理）：**
  - repository root path 只 strip 尾端 `\n`，不連 `\r` 一起吃掉（`src/git/git-service.ts:160`）——
    路徑本身可以合法含 `\r`。
  - 合併兩套 object-id validator（`src/git/git-command.ts:15` 與 `src/git/git-diff.ts:68`）成單一 contract。
  - 移除死碼：`git-change-parser.ts` 裡不可能出現的 `"B"` status 分支。
  - `Stream.decodeText`（`src/platform/command-runner.ts:129`）補 final flush，或改為整段 decode——
    目前多位元組 UTF-8 序列跨 chunk 邊界時尾端會遺失／變成替代字元。
  - diff 命令的 timeout 從固定 10s 改為 diff 專用的較大值（`src/git/git-command.ts:11`）：
    `--find-copies-harder` 在大 repository 上可能超過 10s。

## Out Of Scope

- scope 語意變更（019–022：committed range、merge-base、composed scope、default branch inference）。
- file skip policy 與 oversized-file 處理（025）。
- `.reviewstuffignore`（024）。
- path filter flags（023）。

## Steps

1. 先把 `parseUnifiedDiff` 改成 multi-record contract 與其單元測試，再接 `readDiffPatch` 的 record 選取。
2. 加入 git 環境釘住（config、env、timeout），以 config 被使用者改動過的 temporary repository 驗證。
3. 修 untracked 目錄過濾與 tracked-D／untracked-A 去重，並寫下 path 唯一性 invariant。
4. 收尾小項，保持每一步 typecheck 與既有測試綠燈。

## Accept

- typechange、copy + 修改 source、rename swap（A→B、B→A）、embedded repository、`git rm --cached`、
  `diff.suppressBlankEmpty=true` 各有 temporary-repository fixture，且 review 能完成而非整體失敗。
- 上述每個 fixture 中該 path 在 report 內恰好出現一次。
- command-runner 有多位元組 UTF-8 跨 chunk 邊界的解碼測試。
- object-id validation 只有一個實作，兩處呼叫共用。
- 繼承 `GIT_DIR`／`GIT_WORK_TREE` 的環境下 review 仍作用在 `--dir` 選定的 repository。
- `bun run typecheck` 與既有 `bun test` 全綠。

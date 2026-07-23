# 025 — Centralize file skip policy

[← Plan index](./README.md)

**Depends on:** 024。 **Learning:** observable conservative input policy。

**Working state:** binary、media、generated、lock、build output 都由單一 selection policy 判斷並回報 stable reason；
不在 Git adapter 或 engine 各自靜默略過。

**In:** hard exclusion vs overridable default、rename/delete location policy、config override、coverage summary。
**Out:** semantic generated detection、provider-specific truncation、language analyzers。

**Steps:** 將現有 binary behavior 移到 pure selection contract；hard exclude binary/media；其餘 override 仍受
012 budget；補每個 heuristic fixture與 boundary test。

**注意（現況修正）：** large-file skip 目前只有 schema 與 renderer 支援（`file-too-large` coverage variant、
`LargeSkippedFileCoverageSchema`），source 裡沒有任何 producer——單一檔案的 patch 超過
`gitPatchMaxOutputBytes`（4 MiB，`src/git/git-diff.ts`）會以 `GitCommandOutputLimitError` 讓整個 review
失敗，而不是 skip 該檔案。本 plan 必須：(1) 在收 patch 前用目前未接線的 `readGitObjectSize`
（`src/git/git-command.ts`；untracked 檔另以 filesystem size 檢查，對應 `GitExecutionError` 的
`file-inspection` failure）做大小預檢，超限產出 `file-too-large` skip；(2) 讓 per-file 輸出上限不再是
全 review 的失敗路徑。另外定義 coverage 語意：政策性排除（binary/media hard exclude）與資源性
skip（budget/size）分開，政策性排除不應永久把 `coverage.complete` 標為 false——目前任何含 binary
變更的 review 都會顯示 "Review coverage incomplete"。

**Accept:** 每個 scope file 恰有一個 final status；override 不繞過 containment/hard cap；rename/delete 不 crash；
human/JSON/request coverage counts 一致；oversized file 產生 `file-too-large` skip 而非整體失敗；
`coverage.complete` 的語意在 human/JSON 輸出中對 policy exclusion 與 resource skip 有明確且一致的定義。


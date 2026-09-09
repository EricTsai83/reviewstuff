# 025 — Centralize file skip policy

[← Plan index](./README.md)

**Depends on:** 023、053。 **Learning:** observable conservative input policy。

> 排序說明：本 plan 先於 024 執行。central selection policy 與 coverage reason 基礎設施先就位，
> 024 的 `.reviewstuffignore` exclusion 直接掛在同一 policy 上，避免 024 先自建一套 exclusion
> 路徑再被本 plan 重構。oversized-file 與 unattributable diff 的整體失敗路徑已由 053 hotfix 處理，
> 本 plan 只把它們納入同一個 policy 與 coverage 語意。

**Working state:** binary、media、generated、lock、build output 都由單一 selection policy 判斷並回報 stable reason；
不在 Git adapter 或 engine 各自靜默略過。

**In:** hard exclusion vs overridable default、rename/delete location policy、config override（同步更新 048
provenance）、coverage summary、`coverage.complete` 語意。
**Out:** semantic generated detection、provider-specific truncation、language analyzers、size 預檢與
per-file 輸出上限（053）。

**Steps:** 將現有 binary behavior 與 053 的 `file-too-large`/`unsupported-diff` 移到 pure selection contract；
hard exclude binary/media；其餘 override 仍受 012 budget；補每個 heuristic fixture 與 boundary test。

**Coverage 語意（本 plan 唯一一次 report bump）：** 政策性排除（binary/media hard exclude、
generated/lock default exclude、024 的 ignore）與資源性 skip（budget、size、unsupported diff）分開。
`coverage.complete` 只描述資源性 skip：政策性排除不把它標為 false。目前任何含 binary 變更的
review 都會顯示 "Review coverage incomplete"，這是要修正的行為。human/JSON 對兩類各有獨立計數。

**Accept:** 每個 scope file 恰有一個 final status；override 不繞過 containment/hard cap；rename/delete 不 crash；
human/JSON/request coverage counts 一致；`coverage.complete` 對 policy exclusion 與 resource skip 的定義在
human/JSON 一致且有 fixture；report 只 bump 一次。

# 032 — Define the review exit-code contract

[← Plan index](./README.md)

**Depends on:** 026（report 與 `FindingSeverity` contract）。 **Learning:** exit codes as a stable machine contract。

> 排序說明：本 plan 提前到 027–031 之前執行。exit-code 遷移（execution failure 1 → 2）要改動
> 既有 e2e assertions；若排在 sessions/query/replay 之後，029–031 新增的 e2e 也得跟著遷移。
> 先固定 contract，後續 plan 直接以正確 code 撰寫測試。

**Working state:** `reviewstuff review` 以固定 exit code 區分「執行成功」、「findings 達 gate 門檻」與
「執行失敗」；`--fail-on <severity>` 讓 findings 成為 gate。未指定 `--fail-on`（CLI 或 config）時
維持現行為：findings 不影響 exit code。

**In:** exit-code decision table（success=0、gated findings=1、execution failure=2）、`--fail-on` flag 與
config 欄位、severity threshold ordering、human/JSON 一致的 exit 行為、documented contract、
usage-error exit code 驗證：實測 CLI parser 對 unknown flag/invalid value 的 exit code，若為 1
（與 findings gate 相同），必須把 usage error 對應到 2（或其他非 1 的 code）——CI 不能把「打錯
flag」誤判成「有 findings」。
**Out:** NDJSON event mapping（033）、doctor exit policy（034）、CI workflow（039）、finding suppression/
baseline file。

**Steps:** 先寫 decision table；severity ordering 重用既有 `FindingSeverity`；gate evaluation 是
report → exit decision 的 pure function；execution failure 從現行 exit 1 遷移到 2，同步更新既有
e2e assertions；terminal/JSON render 顯示 gate 結果；per-code compiled binary e2e。

**Accept:** 未設 `--fail-on` 時既有行為不變；gate 只依賴 report 內容且 deterministic；execution
failure 與 findings gate 不共用同一 code；usage error 不與 findings gate 共用 exit 1，且有 e2e 佐證；
human 與 `--json` path 對相同輸入回傳相同 exit code；contract 文件化，033/034/039 與 docs plans
沿用而非各自定義。

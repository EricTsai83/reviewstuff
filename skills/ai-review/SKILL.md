---
name: ai-review
description: 對目前 diff 做獨立跨模型 code review。commit 前、開 PR 前，或使用者要求第二意見時使用。
---

用 `ai-review` CLI 對目前的變更做跨模型審查（審查模型 ≠ 撰寫模型）。

1. 跑 `ai-review --staged --json`。在 Claude Code 裡執行時，確保審查方不是 Claude：
   預設配置已把 correctness/typescript 指到 `openai-codex/gpt-5.5`（獨立第二意見）；
   若要全部換掉，加 `--model openai-codex/gpt-5.5`。
   stderr 回報「沒有可 review 的變更」時，去掉 `--staged` 重跑（改看 working tree）。
2. 解析 stdout 的 JSON。對每條 severity 為 `error` / `critical` 的 finding：
   修掉它，或向使用者說明為何是誤報（引用 `rationale`）。
3. 修完後重跑，直到 exit code 為 0，然後向使用者總結剩餘的 warnings。

Exit codes：`0` 乾淨 · `1` 有達標 findings · `2` 環境/設定問題（把 stderr 訊息回報給使用者，
常見解法：`ai-review doctor`、`ai-review login openai-codex`）· `3` 執行期失敗（引擎全掛）。

進階選項：
- `--profile quick`：只用 1 次模型呼叫（迭代中的快速檢查、省額度）。
- `--profile thorough`：全部 reviewer × 雙模型互審 + verify 剔誤報（重要變更、開 PR 前）。
- `--verify`：在 standard profile 也啟用誤報裁決。
- 存量問題干擾時：請使用者考慮 `--update-baseline` 建立基準線。

額度提醒：review 消耗使用者的訂閱額度；不要在迴圈裡連續大量呼叫，單次修完再重跑；
迭代中用 `--profile quick`，最後一輪才用預設或 thorough。

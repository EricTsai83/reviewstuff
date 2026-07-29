# 051 — Harden secret redaction

[← Plan index](./README.md)

**Depends on:** 050。 **Learning:** redaction as a guaranteed property of the sent payload。

> 排序說明：Plan 014 已 DONE，但 redaction 目前在 pipeline 中晚於 budget 執行，且對不完整或
> 行內的 secret 形狀無效——這是「已送出的 payload 可能含明文 key」的現存漏洞，優先於 048 的
> UX 工作。

**Working state:** redaction 先於 budget selection 執行、對不完整／行內／單一字元類別的 secret 形狀
仍然有效，且 report 明確揭露 redaction 發生過幾次、屬於哪些類別。

## In Scope

- **不完整 PEM。** `src/review/review-redaction.ts:195-217` 在找不到 `-----END ...-----` 時
  `endPartIndex === undefined → continue`，整段 key body 原樣送上 cloud。改為從 `BEGIN` redact
  到字串結尾，並計為 `private-key`（截斷的 diff 或 hunk 邊界都會產生這個形狀）。
- **行內 PEM。** 目前 PEM 偵測是 anchored（`review-redaction.ts:62-69`）。加入非 anchored fallback，
  偵測出現在字串字面值內的 `-----BEGIN ...-----`（測試檔與 config 產生器常見）。
- **單一字元類別的長 token。** `review-redaction.ts:92-105` 要求 `hasTokenSymbol` 與 `hasUppercase`
  同時成立；AWS secret access key 這類 base64 token 約 28% 的情況兩者不同時滿足而漏檢。改為
  ≥40 字元的候選不再要求該組合，以 entropy 門檻判定。同時明文化 hex 排除政策：40-hex 的 git SHA
  在程式碼中極常見，保持不 redact，並以 false-positive fixture 固定這個決定。
- **Redacted block 的 diff prefix。** `review-redaction.ts:224-231` 對整個 block 使用單一 prefix；
  當 block 混合 `+`／`-`／context 行時會弄壞 hunk 行數。改為逐行保留該行自身的 `[ +-]` prefix。
- **Pipeline 順序。** `src/use-cases/run-review.ts` 改為 normalize → **redact** → budget/select → request。
  目前 budget 量的是 redaction 之前的內容（`run-review.ts:222-241`），budget invariant 對「實際送出
  的 payload」不成立。
- **Redaction summary 進 report。** `run-review.ts:235` 目前把 summary 丟棄。依既有 v2→v6 migration
  模式將 report schema 升到 v7（`src/domain/report.ts`），帶各類別的 redaction counts；renderer 顯示
  一行提示。順帶處理 v4 migration 憑空捏造 `privacy: local` 的問題
  （`src/domain/report.ts:301-312`）：migration 必須把該欄位標記為 legacy/unknown，或明文記錄
  這個假設，不得讓舊 report 看起來像是有實際 privacy 證據。
- **小項：** `sha256-`／`sha512-` integrity hash allowlist——目前 >4096 字元一律 redact
  （`review-redaction.ts:155`）會吃掉整段 lockfile 內容。

## Out Of Scope

- 新增 secret 類別（cloud provider 專屬格式掃描）。
- redaction 可設定化（自訂 pattern、per-repo allowlist）。
- session persistence 與其 redaction 保證（027–029）。
- engine transport 的 secret hygiene（052）。

## Steps

1. 先修 detector 形狀（不完整 PEM、行內 PEM、單一字元類別 token、prefix 保留）與其 fixtures。
2. 再搬移 pipeline 順序，讓 budget invariant 對 redacted payload 成立。
3. 最後升 report v7、加 migration 與 renderer 提示，並修正 v4 migration 的 privacy 假設。

## Accept

- 跨 hunk 的 PEM、被 budget 截斷的 PEM、CRLF diff、行內 PEM 各有 fixture 且完整 redact。
- redaction 觸發後 budget invariant 仍成立（以 redacted payload 計量）的測試。
- property test：出現在未被選中 hunk 的 secret 不會進入 engine request。
- 混合 `+`／`-`／context 行的 redacted block 不改變 hunk 行數。
- 40-hex git SHA 的 false-positive fixture 維持不 redact。
- report v7 有 current 與 previous-version fixture；既有 v6 fixture 的 migration 測試通過。
- `bun run typecheck` 與既有 `bun test` 全綠。

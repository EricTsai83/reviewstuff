# 052 — Harden cloud engine transport

[← Plan index](./README.md)

**Depends on:** 051。 **Learning:** bounded, diagnosable provider transport。

> 排序說明：Plan 016/017 已 DONE，本 plan 修的是它們留下的 unreachable timeout、無界 response
> read 與指錯欄位的 config 錯誤。JSON escaping 的修正必須早於 038 凍結 JSON output bytes；
> registry 的 table-driven 重整為 035 新增 engine 鋪路。

**Working state:** engine timeout 真的可達且訊息具體、HTTP response 有 byte cap、config 錯誤指向
使用者實際設定的欄位。

## In Scope

- **Timeout 接線。** 外層 `Effect.timeoutOrElse` 與 engine 共用同一個 `config.timeoutMs`
  （`src/use-cases/run-review.ts:268-276`、`:315-319`），外層必定先觸發，於是
  `ReviewEngineTimeoutError` 與 renderer 對應分支（`src/commands/review-error-renderer.ts:122`）
  永遠不可達。改為把「剩餘預算」傳給 engine，讓 engine timeout 先於外層 deadline 發生。
- **HTTP response byte cap。** `await response.text()`（`src/engines/openai-responses-review-engine.ts:114-126`）
  沒有上限，惡意或異常的 provider response 可耗盡記憶體。改為 streamed read + 明確上限 + typed error。
- **Config 錯誤對應。** `outputReserveTokens: 0` 在 config schema 合法，engine 卻回報一個不存在的
  `maxOutputTokens` 欄位（`openai-responses-review-engine.ts:175-183`）。在 config resolution 階段對
  cloud engine 要求 `outputReserveTokens ≥ 1`，錯誤訊息指向 `review.requestBudget.outputReserveTokens`。
- **Decode 韌性。** `incomplete_details` 改為 `Schema.optionalKey(Schema.NullOr(...))`
  （`openai-responses-review-engine.ts:61-63`）；多個 `output_text` part 先串接再 parse，而不是直接
  拒絕（`:303-309`）。
- **診斷性。** non-2xx 與 envelope `failed` 時保留 allowlisted `error.type`／`error.code`
  （`:382-388`、`:406-413`），不含 response body，維持既有 secret hygiene。
- **小項：**
  - `--json` 輸出補上 C1（U+0080–U+009F）與 U+2028／U+2029 轉義，與 terminal renderer 對齊
    （`src/output/report-renderer.ts:38`、`src/output/request-preview-renderer.ts:10`）。必須在 038
    凍結 JSON bytes 之前完成。
  - CLI string flags trim 後驗證非空（`src/commands/review.ts:46-51`），空白字串不再被當成有效值。
  - registry 改 table-driven：factory 與 model policy 併入 `reviewEngineImplementations` 的 entry
    （`src/engines/review-engine-registry.ts:114-165`），移除平行的 switch，為 035 新增 engine 鋪路。

## Out Of Scope

- retry／backoff 與 Retry-After（036）。
- provider run metadata 持久化（037）。
- doctor report（034）。
- NDJSON event stream（033）。
- 新增 engine 實作（035）。

## Steps

1. 先修 timeout 預算傳遞，讓 `ReviewEngineTimeoutError` 可達並有專屬訊息。
2. 加入 response byte cap 與 typed error，附失敗注入測試。
3. 移動 config validation 到 resolution 階段，錯誤指向真正的欄位。
4. 補 decode 韌性與 allowlisted 診斷欄位。
5. 收尾小項：JSON escaping、flag trim、registry table-driven。

## Accept

- engine timeout 可透過注入 clock 或慢 fake 觸發，並 render 專屬訊息（不是外層 generic timeout）。
- response byte cap 有失敗注入測試，超限回傳 typed error 而非 OOM。
- envelope `failed`／`in_progress`／`queued` 與 `incomplete_details` 缺失／為 null 都有 decode 測試。
- 多個 `output_text` part 的 response 能成功 parse。
- `outputReserveTokens: 0` 有 e2e config 錯誤測試，訊息指向 `review.requestBudget.outputReserveTokens`。
- localhost endpoint 分支有測試（privacy mode 判定不因本 plan 改動而變）。
- `--json` 與 terminal renderer 對 C1／U+2028／U+2029 的處理一致，並有 fixture。
- 既有 secret-hygiene 測試全綠；`bun run typecheck` 與 `bun test` 通過。

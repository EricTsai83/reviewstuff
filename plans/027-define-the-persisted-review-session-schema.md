# 027 — Define the persisted review session schema

[← Plan index](./README.md)

**Depends on:** 026、032。 **Learning:** durable schema design before filesystem code。

**Working state:** `ReviewSessionV1` fixtures 能表示 effective scope/policy、redacted normalized request、coverage、
engine metadata 與 findings，但尚未寫入 disk。report 的 pre-persistence migration 鏈已被移除。

**Slice 0（先做）：收斂 report schema 版本鏈。** 依 README 的兩階段政策，本 plan 是 029 首次持久化前的
最後一個 schema plan。刪除 `src/domain/report.ts` 中 V2–V6 的 schema、migration 與
`test/fixtures/reports/review-report-v2..v6.json`，`decodeReviewReport` 只接受 current version，
`privacyEvidence` 若只剩 `recorded` 一種值則一併移除。從 029 起任何 bump 都必須帶 migration
與 previous fixture，因為 session 內的 report 會活在使用者 disk 上。

**In:** session/finding/request references、session ID rules、created-at injection、current fixture policy、
slice 0 的 migration 清除。
**Out:** filesystem layout、latest lookup、raw pre-redaction diff/prompt、fix attempts。

**Steps:** 先完成 slice 0 並確認 e2e 不變；從實際 output contract 設計 schema；只保存 014 redaction 後
的 request；用 fake Clock/ID 產生 deterministic fixture；定義 corrupt/unsupported version errors。

**Accept:** schema 不含 credentials/raw provider body；同一 finding/report schema 不被複製成第二套，
session 直接嵌入 current report schema；decode all-or-nothing；future fix/analyzer 欄位不先預留空殼；
repo 內不再有 pre-persistence migration 或其 fixture。

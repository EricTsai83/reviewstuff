# 007 — Normalize review contracts

[← Plan index](./README.md)

**Depends on:** 005、006。 **Learning:** public schema evolution。

**Working state:** deterministic review 仍維持原行為，但 engine input/output 將使用的
`ReviewFindingV1`、`ReviewReportV3` 與 decode boundary 已固定。

**In:** 定義 normalized severity/category/confidence finding；將 fake marker 映射到新 schema；
report 升版；加入 v2 report fixture 的 migration 或明確 refusal。 **Out:** engine service、prompt、provider。

**Steps:** 先寫 current/previous fixtures；建立 pure schema 與 migration；更新 renderer/use-case；
補 deterministic ID 與 invalid payload tests。

**Accept:** public value 都經 runtime decode；舊 fixture 不會被默默誤讀；human/JSON finding 數值一致；
沒有 provider-specific 欄位。


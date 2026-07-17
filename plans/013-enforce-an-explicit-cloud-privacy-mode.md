# 013 — Enforce an explicit cloud privacy mode

[← Plan index](./README.md)

**Depends on:** 012。 **Learning:** policy gate before transport。

**Working state:** fresh/default config 是 `local-only`；任何 cloud transport 都在 engine call 前被拒絕，
除非使用者明確選擇 `cloud-allowed`。

**In:** versioned privacy config、transport classification、typed policy refusal、effective policy metadata。
**Out:** secret detection、request preview、retention、provider implementation。

**Steps:** schema/migration；在 use-case 建立 pure policy check；fake/local transport fixtures；CLI/config
precedence 與 remediation。

**Accept:** `local-only` 零 cloud call；fake/local 不被錯誤阻擋；policy decision 可測且被 report metadata
記錄；不存在 silent override。


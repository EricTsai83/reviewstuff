# 029 — Persist successful review sessions

[← Plan index](./README.md)

**Depends on:** 028。 **Learning:** use-case transaction boundary。

**Working state:** 每個非-preview、非-skipped review 成功後保存一個 session，JSON/human result 回報 session ID。

**In:** review-to-session mapping、storage failure semantics、latest update、partial provider result policy。
**Out:** query commands、cleanup、prompt snapshot、fix status。

**Steps:** 在 engine result decode 後建立 session；先 save 再 render success；明確決定 engine failure是否保存（v1
不保存 incomplete session）；e2e 驗 no-change/preview zero writes。

**Accept:** command 不直接用 filesystem；saved data等於 redacted request/output；storage failure不誤報 review success；
session ID deterministic only in tests, unpredictable in production。


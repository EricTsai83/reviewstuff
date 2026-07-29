# 029 — Persist successful review sessions

[← Plan index](./README.md)

**Depends on:** 028。 **Learning:** use-case transaction boundary。

**Working state:** 每個非-preview、非-skipped review 成功後保存一個 session，JSON/human result 回報 session ID。

**In:** review-to-session mapping、storage failure semantics、latest update、partial provider result policy、
`.reviewstuff/` gitignore 檢查——session 含 redacted source diff，若目錄未被 git ignore，一次
`git add -A` 就會把它推上 remote；首次寫入時檢查並輸出警告（不自動改 `.gitignore`）。
**Out:** query commands、cleanup（retention 在 045 文件化為 known limitation：資料累積至手動刪除）、
prompt snapshot、fix status。

**Steps:** 在 engine result decode 後建立 session；先 save 再 render success；明確決定 engine failure是否保存（v1
不保存 incomplete session——known limitation：provider 失敗時 037 的 attempt metadata 不留存，
除錯只能靠 terminal output；045 文件需載明）；e2e 驗 no-change/preview zero writes。

**Accept:** command 不直接用 filesystem；saved data等於 redacted request/output；storage failure不誤報 review success；
session ID deterministic only in tests, unpredictable in production；`.reviewstuff/` 未被 ignore 時有
可觀察的警告且有測試。


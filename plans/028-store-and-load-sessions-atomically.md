# 028 — Store and load sessions atomically

[← Plan index](./README.md)

**Depends on:** 027。 **Learning:** atomic single-file persistence and path containment。

**Working state:** `StorageService.save/load/latest` 可在 `.reviewstuff/sessions/<id>.json` 安全運作，尚未接
review use-case。每個 session 就是一個檔案；不建立 per-session 目錄，因為 child files 不在 v1 範圍。

**In:** canonical storage service/layer（放在 architecture test 已預留的 `storage/`）、temp+fsync+rename、
`.reviewstuff/sessions/latest` pointer strategy、symlink/traversal/size limits。
**Out:** retention cleanup、stats cache、multiple JSON child files、migration write-back。

**Steps:** 單一 session file 縮小 transaction；在 `sessions/` 目錄內建 temp 再 rename；驗 regular
directory/file；failure injection tests for truncated/corrupt/rename failure。

**Accept:** contract 不暴露 platform types；partial write 不成為 latest；repo 外零讀寫；load 有 byte cap；tests 使用
temporary repo；並行 process 下 latest pointer 為 last-writer-wins（刻意選擇，atomic rename 保證不
corruption，不引入 lock），此語意寫進 contract 註解與測試。

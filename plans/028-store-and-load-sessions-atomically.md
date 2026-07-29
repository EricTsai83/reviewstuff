# 028 — Store and load sessions atomically

[← Plan index](./README.md)

**Depends on:** 027。 **Learning:** atomic single-file persistence and path containment。

**Working state:** `StorageService.save/load/latest` 可在 `.reviewstuff/sessions/<id>/session.json` 安全運作，尚未接
review use-case。

**In:** canonical storage service/layer、temp+fsync+rename、latest pointer strategy、symlink/traversal/size limits。
**Out:** retention cleanup、stats cache、multiple JSON child files、migration write-back。

**Steps:** 優先以單一 session file縮小 transaction；在 target directory 建 temp；驗 regular directory/file；
failure injection tests for truncated/corrupt/rename failure。

**Accept:** contract 不暴露 platform types；partial write 不成為 latest；repo 外零讀寫；load 有 byte cap；tests 使用
temporary repo；並行 process 下 latest pointer 為 last-writer-wins（刻意選擇，atomic rename 保證不
corruption，不引入 lock），此語意寫進 contract 註解與測試。


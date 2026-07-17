# 039 — Sign and notarize the macOS executable

[← Plan index](./README.md)

**Depends on:** 038。 **Learning:** Apple distribution trust boundary。

**Working state:** opt-in script以 Developer ID、hardened runtime、secure timestamp簽署 executable，提交 notary service並驗證
Gatekeeper；無 credentials 的 dev build仍可用。

**In:** credential preflight、codesign/notarytool/log verification、final artifact repackage/checksum、clean-runner smoke。
**Out:** certificate provisioning、publishing release、Windows signing。

**Steps:** 先在實作時依 current Apple docs/man pages確認可上傳 archive與 ticket stapling支援，不硬編過期假設；secret只由
CI store注入；sign後才 package final bytes；保存 non-secret submission evidence。

**Accept:** unsigned bytes絕不沿用 final checksum；sign/notary failure不產生 releasable artifact；strict codesign + Gatekeeper smoke
通過；log不洩漏 credentials。參考 [Apple notarization guidance](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。


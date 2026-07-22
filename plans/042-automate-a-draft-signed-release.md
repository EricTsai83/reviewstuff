# 042 — Automate a draft signed release

[← Plan index](./README.md)

**Depends on:** 041。 **Learning:** release pipeline separated from PR CI。

**Working state:** manual dispatch或 version tag在 trusted runner建立 signed/notarized darwin-arm64 draft release與 release notes；
不自動 promote/publish channels。

**In:** version/tag consistency、trusted environment、artifact verification/upload、draft release、provenance。
**Out:** npm publish、Homebrew tap push、multi-platform matrix、automatic production promotion。

**Steps:** 先 build unsigned candidate；在 secrets隔離 job簽署/notarize；重新 package/verify；只上傳 final bytes；manual approval後
才允許 release從 draft轉正式。

**Accept:** tag/package/manifest/artifact version一致；untrusted PR無法進 secret job；下載 artifact smoke通過；失敗維持 draft且不
覆蓋 previous release。


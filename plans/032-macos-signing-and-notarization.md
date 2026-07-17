# 032 - macOS Signing And Notarization

## Goal

讓 macOS release binary 通過 codesign/notarization/Gatekeeper。

## Working State

完成後 release binary 可被 macOS 使用者正常下載與執行，Homebrew 安裝不需要額外繞過 Gatekeeper。

## Scope

包含：

- macOS codesign script
- notarization script
- Apple credential validation
- signed artifact verification
- Homebrew formula update for signed artifact

不包含：

- Windows signing
- paid certificate provisioning automation

## Implementation Steps

1. `scripts/sign-macos.ts` 檢查 Apple credentials/Developer ID identity；secret 只由 CI secret
   store 注入，不寫 log/artifact。
2. 以 Developer ID Application、hardened runtime、secure timestamp 與 Bun 所需最小
   entitlements codesign binary，再執行 strict verification。
3. 使用 `ditto` 建立只供 notary submission 的 ZIP，透過 `xcrun notarytool submit --wait`
   提交並保存 submission id/log；tar.gz 不是 notarization upload format。
4. standalone executable 與 ZIP 目前不能直接 staple ticket，因此不要執行假的 stapling step；
   notarization accepted 後重新產生 distribution tarball/checksum/manifest，並在 clean macOS
   runner 驗證 codesign、notary result 與 Gatekeeper/network-ticket behavior。
5. CI release workflow 接入 signing/notarization step；只有 accepted + smoke verified artifacts
   才能取代 031 draft，Homebrew checksum 必須指向簽章後最終 bytes。

## Verification

```bash
codesign --verify --strict --verbose=2 dist/reviewstuff
codesign --display --verbose=4 dist/reviewstuff
xcrun notarytool info <submission-id> --keychain-profile <profile>
xcrun notarytool log <submission-id> --keychain-profile <profile> notarization-log.json
spctl --assess --type execute --verbose=4 dist/reviewstuff
brew test <tap>/reviewstuff
```

## Acceptance Criteria

- signed release 通過 Gatekeeper assessment。
- unsigned local dev build 仍可用。
- signing failure 不會產生標記為正式 release 的 artifact。
- notarization submission 使用 ZIP，且 plan 不宣稱能 staple standalone executable/ZIP。
- final checksum/manifest/Homebrew formula 都在 signing 後重算，不沿用 unsigned artifact checksum。

## Learning Focus

- macOS CLI distribution trust model。
- signing/notarization 與 release pipeline 的關係。

# 027 - macOS Signing And Notarization

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

1. `scripts/sign-macos.mjs` 檢查 Apple env vars。
2. codesign binary。
3. notarize tarball 或 app-specific artifact。
4. stapling/verification if applicable。
5. CI release workflow 接入 signing step。

## Verification

```bash
codesign --verify --deep --strict --verbose=2 dist/reviewstuff
spctl --assess --type execute --verbose dist/reviewstuff
brew test reviewstuff
```

## Acceptance Criteria

- signed release 通過 Gatekeeper assessment。
- unsigned local dev build 仍可用。
- signing failure 不會產生標記為正式 release 的 artifact。

## Learning Focus

- macOS CLI distribution trust model。
- signing/notarization 與 release pipeline 的關係。

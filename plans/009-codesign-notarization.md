# 009 - Codesign And Notarization

## Goal

讓 macOS production binary 避免 Gatekeeper 阻擋，支援正式下載或 Homebrew 以外的安裝方式。

## Depends On

- 008 - Release Artifact Layout

## Scope

包含：

- Developer ID Application signing。
- notarization。
- staple。

不包含：

- 憑證申請。
- Apple account 管理。
- Windows signing。

## Required Secrets

```text
APPLE_TEAM_ID
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_DEVELOPER_IDENTITY
```

## Manual Command Shape

```bash
codesign --force --options runtime --timestamp \
  --sign "$APPLE_DEVELOPER_IDENTITY" \
  dist/reviewstuff

xcrun notarytool submit dist/release/reviewstuff-darwin-arm64.tar.gz \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait

xcrun stapler staple dist/reviewstuff
```

## Implementation

Add:

```text
scripts/sign-macos.mjs
```

The script must:

- Refuse to run if required env vars are missing.
- Print commands before executing.
- Verify signature with:

```bash
codesign --verify --deep --strict --verbose=2 dist/reviewstuff
spctl --assess --type execute --verbose dist/reviewstuff
```

## Acceptance Criteria

- Signed binary passes `codesign --verify`.
- Notarized artifact passes `spctl --assess`.
- Unsigned local development build still works without this script.

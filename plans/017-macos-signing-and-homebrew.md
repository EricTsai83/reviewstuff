# 017 - macOS Signing And Homebrew

## Goal

讓 macOS 使用者能信任並方便地安裝 release binary。

## Working State

完成後支援：

```bash
brew install <tap>/reviewstuff
reviewstuff --version
```

## Scope

包含：

- macOS codesign script
- notarization script
- Homebrew formula
- formula test

不包含：

- Windows signing
- npm distribution
- auto-update

## Implementation Steps

1. `scripts/sign-macos.mjs` 檢查 Apple env vars。
2. 對 binary codesign。
3. notarize release artifact。
4. Formula 下載 016 的 tarball，驗 sha256，`bin.install "reviewstuff"`。
5. `brew test` 跑 `reviewstuff --version`。

## Verification

```bash
codesign --verify --deep --strict --verbose=2 dist/reviewstuff
spctl --assess --type execute --verbose dist/reviewstuff
brew test reviewstuff
```

## Acceptance Criteria

- unsigned local dev build 仍可用。
- signed release 通過 Gatekeeper assessment。
- Homebrew 不重新 build source。


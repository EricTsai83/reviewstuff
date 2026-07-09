# 020 - Homebrew Install Path

## Goal

先建立 Homebrew 安裝路徑，macOS signing/notarization 留到 release hardening。

## Working State

完成後支援：

```bash
brew install <tap>/reviewstuff
reviewstuff --version
```

## Scope

包含：

- Homebrew formula
- formula test
- checksum pinning

不包含：

- macOS codesign
- notarization
- Windows signing
- npm distribution
- auto-update

## Implementation Steps

1. Formula 下載 019 的 release tarball。
2. Formula 驗 sha256。
3. Formula 使用 `bin.install "reviewstuff"`。
4. `brew test` 跑 `reviewstuff --version`。
5. 文件說明 unsigned binary 的 macOS Gatekeeper 注意事項。

## Verification

```bash
brew test reviewstuff
```

## Acceptance Criteria

- unsigned local dev build 仍可用。
- Homebrew 不重新 build source。
- Formula 使用 release tarball 與 checksum。

## Learning Focus

- Homebrew formula 的最小 binary distribution。
- 先驗證安裝通道，再處理 Apple signing/notarization。

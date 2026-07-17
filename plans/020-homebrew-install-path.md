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
- deterministic `test:package:homebrew` harness（建立/清理 test-only tap）

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
4. 在 test-only tap 安裝 formula，`test do` 至少驗證 `reviewstuff --version` 與一個不需
   credentials 的 fake/no-change CLI path，再執行 `brew test <tap>/reviewstuff`。
5. 文件說明 unsigned binary 的 macOS Gatekeeper 注意事項。
6. package script `test:package:homebrew` 建立唯一 test tap、安裝/audit/test formula，並在
   finally 清理 tap；不依賴或覆蓋使用者既有同名 formula。

## Verification

```bash
bun run test:package:homebrew
```

## Acceptance Criteria

- unsigned local dev build 仍可用。
- Homebrew 不重新 build source。
- Formula 使用 release tarball 與 checksum。
- local/CI verification 明確建立 test tap，不依賴機器上碰巧存在的同名 formula。

## Learning Focus

- Homebrew formula 的最小 binary distribution。
- 先驗證安裝通道，再處理 Apple signing/notarization。

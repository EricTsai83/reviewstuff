# 018 - NPM Multi Platform And Update

## Goal

補齊 npm 安裝通道、多平台 binaries、direct install update policy。

## Working State

完成後支援：

```bash
npm install -g reviewstuff
reviewstuff update --check
```

並能發佈多平台 release artifacts。

## Scope

包含：

- npm meta package
- npm platform packages
- multi-platform build targets
- update manifest policy
- install type detection

不包含：

- background daemon
- silent update
- rebuilding from source during npm install

## NPM Strategy

```text
reviewstuff
@reviewstuff/darwin-arm64
@reviewstuff/darwin-x64
@reviewstuff/linux-x64
@reviewstuff/linux-arm64
```

主 package 只做 platform selection；實際執行 release binary。

## Update Policy

- Homebrew install: 指引用 `brew upgrade`。
- npm install: 指引用 package manager update。
- local symlink: 指引用 `bun run build`。
- direct tarball install: 可 self-update，且必須驗 checksum。

## Verification

```bash
bun run package:release
npm install -g ./packages/npm/reviewstuff/*.tgz
reviewstuff --version
reviewstuff update --check
```

## Acceptance Criteria

- npm 執行同一份 standalone binary。
- 多平台 manifest 正確。
- self-update replacement atomic 且 checksum verified。

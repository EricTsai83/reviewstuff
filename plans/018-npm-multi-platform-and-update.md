# 018 - NPM First Platform Package

## Goal

補齊 npm 安裝通道的第一個平台 package，multi-platform 與 update policy 留到後續 hardening。

## Working State

完成後支援：

```bash
npm install -g reviewstuff
```

並能從 npm wrapper 執行同一份 release binary。

## Scope

包含：

- npm meta package
- first platform package：`@reviewstuff/darwin-arm64`
- install type detection

不包含：

- Linux packages
- macOS x64 package
- update command
- update manifest policy
- background daemon
- silent update
- rebuilding from source during npm install

## NPM Strategy

```text
reviewstuff
@reviewstuff/darwin-arm64
```

主 package 只做 platform selection；實際執行 release binary。

## Update Policy

- Homebrew install: 指引用 `brew upgrade`。
- npm install: 指引用 package manager update。
- local symlink: 指引用 `bun run build`。
- direct tarball install: 先只提示手動下載新版；self-update 留到後續 plan。

## Verification

```bash
bun run package:release
npm install -g ./packages/npm/reviewstuff/*.tgz
reviewstuff --version
```

## Acceptance Criteria

- npm 執行同一份 standalone binary。
- unsupported platform 有清楚錯誤。
- npm wrapper 不從 source rebuild。

## Learning Focus

- npm meta package + optional platform package pattern。
- 先做單平台閉環，再擴展 multi-platform matrix。

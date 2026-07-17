# 021 - NPM First Platform Package

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
- deterministic `test:package:npm` temporary-project install harness

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
platform package 使用 `os` / `cpu` metadata，meta package 以 optional dependency 指向平台
package；wrapper 只解析 allowlisted package name，不執行 install script、不在安裝時下載或 build。

test harness 使用 temporary project 與 isolated cache/install directory，以 Bun 安裝本機打包的
meta + platform tarballs，直接執行該 project 的 `node_modules/.bin/reviewstuff`，最後清理；
不得修改 global package state。

## Update Policy

- Homebrew install: 指引用 `brew upgrade`。
- npm install: 指引用 package manager update。
- local symlink: 指引用 `bun run build`。
- direct tarball install: 先只提示手動下載新版；self-update 留到後續 plan。

## Verification

```bash
bun run package:release
bun --cwd packages/npm/reviewstuff pm pack --ignore-scripts
bun --cwd packages/npm/darwin-arm64 pm pack --ignore-scripts
bun run test:package:npm
```

## Acceptance Criteria

- npm 執行同一份 standalone binary。
- unsupported platform 有清楚錯誤。
- npm wrapper 不從 source rebuild。
- package tarball contents、`os`/`cpu`、optional dependency version 與 bundled binary checksum 有測試。

## Learning Focus

- npm meta package + optional platform package pattern。
- 先做單平台閉環，再擴展 multi-platform matrix。

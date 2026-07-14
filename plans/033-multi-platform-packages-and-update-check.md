# 033 - Multi Platform Packages And Update Check

## Goal

補齊 production 安裝通道：多平台 npm packages、update check、install channel detection。

## Working State

完成後支援：

```bash
npm install -g reviewstuff
reviewstuff update --check
```

並支援 macOS/Linux 主要架構。

## Scope

包含：

- npm packages：darwin-arm64、darwin-x64、linux-x64、linux-arm64
- unsupported platform error
- update manifest
- `UpdateService` contract 與 canonical implementation；測試 fake 留在 tests
- `reviewstuff update --check`
- install type detection
- update guidance per install channel

不包含：

- direct tarball self-update
- silent background update
- Windows packages
- rebuilding from source during npm install

## Implementation Steps

1. 擴充 release manifest 多平台 artifacts。
2. 建立 npm platform packages。
3. npm meta package 做 platform selection。
4. 在 `UpdateService` canonical module 實作 install type detection 與 network-backed
   update check；contract 不暴露 filesystem/network/platform types，use-case tests 在
   測試附近建立 fake layer。
5. update use-case 只依賴 `UpdateService`，command 只 render typed result。
6. 根據 install channel 顯示更新建議：npm 用 package manager、Homebrew 用 brew、direct tarball 指向 034。

## Verification

```bash
bun run package:release
npm install -g ./packages/npm/reviewstuff/*.tgz
reviewstuff --version
reviewstuff update --check
```

## Acceptance Criteria

- npm 執行同一份 standalone binary。
- macOS/Linux supported platforms 可安裝。
- unsupported platform 有清楚錯誤。
- update check 不會靜默修改使用者系統。
- install channel detection 可被 doctor 使用。
- update/doctor use-cases 不直接依賴 network、filesystem 或 platform service。

## Learning Focus

- npm optional platform package pattern。
- update policy 與 install channel detection。

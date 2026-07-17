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
- signed update manifest + embedded verification public key/key-id
- `UpdateService` contract 與 canonical implementation；測試 fake 留在 tests
- `reviewstuff update --check`
- install type detection
- update guidance per install channel
- deterministic `test:update-check` fake-network/signature harness

不包含：

- direct tarball self-update
- silent background update
- Windows packages
- rebuilding from source during npm install

## Implementation Steps

1. 擴充 release manifest 多平台 artifacts，明確記錄 OS/arch/libc/x64 compatibility variant。
2. 建立 npm platform packages；每個 package 使用正確 `os`/`cpu` metadata、只包含對應
   signed/release binary，且不使用 install script 下載或 rebuild。
3. npm meta package 以 exact-version optional dependencies 做 allowlisted platform selection。
4. 為 update manifest 定義 canonical serialization、signature、key id 與 key rotation/refusal
   policy；release workflow 用離線/CI private key 簽署，binary 只嵌入 public key。checksum
   驗 artifact integrity，signature 才建立 manifest authenticity。
5. 在 `UpdateService` canonical module 實作 install type detection 與 network-backed
   update check；contract 不暴露 filesystem/network/platform types，use-case tests 在
   測試附近建立 fake layer。只允許固定 HTTPS origin、限制 redirect/response size/timeout，
   並在解析版本或顯示更新前先驗 signature。
6. update use-case 只依賴 `UpdateService`，command 只 render typed result。
7. 根據 install channel 顯示更新建議：npm 用 package manager、Homebrew 用 brew、direct tarball 指向 034。

## Verification

```bash
bun run package:release
bun --cwd packages/npm/reviewstuff pm pack --ignore-scripts
bun run test:package:npm -- --matrix
bun run test:update-check
```

## Acceptance Criteria

- npm 執行同一份 standalone binary。
- macOS/Linux supported platforms 可安裝。
- unsupported platform 有清楚錯誤。
- update check 不會靜默修改使用者系統。
- install channel detection 可被 doctor 使用。
- update/doctor use-cases 不直接依賴 network、filesystem 或 platform service。
- manifest bad/unknown-key/rollback signature、redirect 到非 allowlisted origin、oversized response
  都被拒絕；update check 不信任未簽 checksum。
- deterministic tests 使用 fake network/fixture manifest；對 production manifest 的 live check 是
  明確 opt-in，不是一般 `bun run test` 必要條件。

## Learning Focus

- npm optional platform package pattern。
- update policy 與 install channel detection。

# 034 - Direct Tarball Self Update

## Goal

在 update manifest 和 install channel detection 穩定後，支援 direct tarball install 的安全 self-update。

## Working State

完成後 direct tarball 安裝的使用者可以執行：

```bash
reviewstuff update
```

CLI 會下載新版、驗 checksum，並 atomic replacement。

## Scope

包含：

- `reviewstuff update`
- direct tarball install self-update
- 擴充 `UpdateService` live adapter 的 verified replacement transaction
- checksum verification
- atomic binary replacement
- rollback on failed replacement
- clear refusal for npm/Homebrew/dev installs

不包含：

- silent background update
- Windows updater
- package-manager managed installs 的自動修改
- daemon/auto-restart

## Implementation Steps

1. 使用 033 的 install channel detection 判斷是否允許 self-update。
2. update use-case 將 target version 交給 `UpdateService`；use-case 不直接取得
   network、filesystem 或 `CommandRunner`。
3. `UpdateServiceLive` 下載符合目前平台的 artifact，驗證 checksum 後解壓到 temp
   directory。
4. live adapter 透過 `CommandRunner` 驗證新版 binary 可執行且 `--version` 符合
   manifest。
5. live adapter 使用 platform filesystem atomic replacement 寫回目前 binary path。
6. replacement failure 時由 scoped transaction rollback/cleanup，並回傳 typed diagnostic。

## Verification

```bash
bun run package:release
reviewstuff update --check
reviewstuff update
reviewstuff --version
```

## Acceptance Criteria

- 只有 direct tarball install 會執行 self-update。
- npm/Homebrew/dev install 會拒絕並提示正確更新方式。
- checksum mismatch 拒絕更新。
- replacement failure 不破壞現有 binary。
- update 操作有清楚 stdout/stderr 與 exit code。
- command 只 render typed update result；platform errors 不直接洩漏到 CLI contract。

## Learning Focus

- updater 的 trust boundary。
- 為什麼 install channel detection 必須先於 self-update。
- atomic replacement 和 rollback 在 CLI distribution 中的角色。

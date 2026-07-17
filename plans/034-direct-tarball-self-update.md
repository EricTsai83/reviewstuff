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
- 擴充 `UpdateService` canonical implementation 的 verified replacement transaction
- checksum verification
- signed manifest verification
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
3. `UpdateService.layer` 的 implementation 先以 033 embedded public key 驗 manifest signature，
   再下載符合目前 platform/libc/variant 的 artifact 並驗 size + checksum。archive extraction
   拒絕 absolute path、`..`、symlink/hardlink、額外 executable 與 decompression size overflow。
4. concrete implementation 透過 `CommandRunner` 驗證新版 binary 可執行且 `--version` 符合
   manifest。
5. 驗證目前 executable 是 regular file、非 symlink、由目前使用者可寫且 install channel/path
   identity 未變；不提權、不跟隨 mutable target。
6. 在目前 executable 同一 directory/filesystem 建立已 fsync、保留 mode 的 replacement，
   最後用單次 atomic rename 取代 target；不要先 rename 掉舊 binary 造成 crash window。
7. replacement 前保留可驗 preimage/backup metadata；失敗時舊 binary 仍在原 path，cleanup
   failure 只回 typed diagnostic，不把成功/失敗狀態混在一起。

## Verification

```bash
bun run package:release
bun run test:self-update
```

`test:self-update` 只操作 temporary direct-tarball install 與 local fixture server，驗證 old -> new、
tampered manifest/archive、interrupted replacement 與 rollback；不得替換開發中的 `dist/reviewstuff`
或使用者 PATH 上的 binary。production manifest 的 live smoke 必須另行 opt-in。

## Acceptance Criteria

- 只有 direct tarball install 會執行 self-update。
- npm/Homebrew/dev install 會拒絕並提示正確更新方式。
- checksum mismatch 拒絕更新。
- manifest signature/key/version rollback mismatch 拒絕更新。
- replacement failure 不破壞現有 binary。
- update 操作有清楚 stdout/stderr 與 exit code。
- command 只 render typed update result；platform errors 不直接洩漏到 CLI contract。
- archive traversal/link/decompression-bomb、symlink target、permission change 與 TOCTOU fixture 有測試。

## Learning Focus

- updater 的 trust boundary。
- 為什麼 install channel detection 必須先於 self-update。
- atomic replacement 和 rollback 在 CLI distribution 中的角色。

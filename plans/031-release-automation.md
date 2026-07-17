# 031 - Release Automation

## Goal

在 030 的 CI gate 穩定後，建立可重複產生 release artifacts 的 tag workflow。

## Working State

完成後 release tag/manual dispatch 可以由 CI 產生 draft tarball、checksum、manifest 與
smoke-install artifacts；032 完成前不把 unsigned macOS artifact 自動 promote 成 production release。

## Scope

包含：

- release tag workflow
- multi-platform build matrix
- release artifact upload
- checksum verification
- smoke install tests
- release draft notes

不包含：

- production telemetry
- automatic npm publish without approval
- automatic Homebrew tap push without approval
- macOS signing/notarization

## Implementation Steps

1. 新增 release workflow draft，只在 tag 或 manual dispatch 執行。
2. matrix build macOS/Linux targets。
   cross-compile 可以產生 target binary，但 executable smoke 必須在相符 OS/arch runner 執行；
   Linux x64 明確選擇 baseline/modern compatibility policy，manifest 記錄 target/libc/variant。
3. 驗證 tag、`package.json` version、artifact filename 與 manifest version 完全一致。
4. 產生 deterministic packaging metadata（固定 tar entry ordering、owner、mode、mtime）、checksum、
   manifest；量測 Bun compiler binary bytes 是否 reproducible，若 toolchain 本身非 deterministic，
   不做虛假保證，改以 pinned toolchain + source commit + build provenance 追蹤。
5. artifacts 上傳前驗 checksum、manifest schema 和 tarball layout。
6. 在 target runner 執行 binary 與 smoke-install tests，不能在 build host 執行其他架構 binary。
7. 產生 release draft notes，列出 artifact names 和 checksums；signing/notarization 未完成時保持 draft。

## Verification

```bash
bun run package:release
```

CI manual dispatch 產生的 artifacts 必須能下載後本機 smoke test。

## Acceptance Criteria

- release artifacts 由 CI 產生且 checksums 一致。
- smoke install 在 CI 跑過。
- release workflow 不會自動 publish npm 或 push Homebrew tap。
- signing/notarization 留給 032。
- packaging metadata deterministic；standalone binary reproducibility 有實測結果，無法 bit-for-bit
  重現時以 pinned toolchain、source commit 與 build provenance 明確記錄，不宣稱已重現。
- 032 前的 macOS artifact 清楚標示 unsigned/draft，不會被誤發成 production release。

## Learning Focus

- release artifact reproducibility。
- 為什麼 CI gate 和 release pipeline 要分開設計。

# 031 - Release Automation

## Goal

在 030 的 CI gate 穩定後，建立可重複產生 release artifacts 的 tag workflow。

## Working State

完成後 release tag 可以由 CI 產生 tarball、checksum、manifest 與 smoke-install artifacts。

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
3. 產生 release tarball、checksum、manifest。
4. artifacts 上傳前驗 checksum 和 tarball layout。
5. 執行 smoke install tests。
6. 產生 release draft notes，列出 artifact names 和 checksums。

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

## Learning Focus

- release artifact reproducibility。
- 為什麼 CI gate 和 release pipeline 要分開設計。

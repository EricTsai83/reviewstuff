# 026 - CI And Release Automation

## Goal

建立可重複、可驗證的 CI 與 release pipeline。

## Working State

完成後 main branch 和 release tag 都會自動跑完整驗證；release artifacts 可由 CI 產生。

## Scope

包含：

- GitHub Actions CI
- Bun install with frozen lockfile
- typecheck/test/build
- binary e2e tests
- multi-platform build matrix
- release artifact upload
- checksum verification
- smoke install tests

不包含：

- production telemetry
- automatic npm publish without approval
- automatic Homebrew tap push without approval

## Implementation Steps

1. 新增 CI workflow。
2. 新增 release workflow draft。
3. 將 plan verification commands 映射到 CI jobs。
4. matrix build macOS/Linux targets。
5. artifacts 上傳前驗 checksum 和 tarball layout。

## Verification

```bash
bun run typecheck
bun run test
bun run build
bun run package:release
```

## Acceptance Criteria

- PR/branch CI 穩定。
- release artifacts 由 CI 產生且 checksums 一致。
- smoke install 在 CI 跑過。

## Learning Focus

- production CLI 的 CI gate。
- release artifact reproducibility。

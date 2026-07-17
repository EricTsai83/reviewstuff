# 030 - CI Gate

## Goal

建立可重複、可驗證的 PR/branch CI gate。

## Working State

完成後 PR 和 main branch 都會自動跑 typecheck、test、build、binary e2e。

## Scope

包含：

- GitHub Actions CI for PR/main
- Bun install with frozen lockfile
- typecheck/test/build
- binary e2e tests
- CI cache policy
- artifact upload for failed test diagnostics

不包含：

- release tag workflow
- multi-platform build matrix
- release artifact upload
- checksum verification
- smoke install tests
- production telemetry
- automatic npm publish without approval
- automatic Homebrew tap push without approval

## Implementation Steps

1. 新增 CI workflow。
2. 設定 Bun install with frozen lockfile；workflow/actions 使用最小 permissions 並 pin 到
   reviewed major/version policy（security-sensitive third-party action 優先 commit SHA）。
3. 將 plan verification commands 映射到 CI jobs。
4. 執行 typecheck/test/build/binary e2e。
5. 上傳失敗時的 stdout/stderr/test artifacts 方便診斷。
   artifact 不得包含 credentials、provider payload、使用者 repo content 或未 redacted session；
   CI 全程只使用 fake provider/fixtures。

## Verification

```bash
bun run typecheck
bun run test
bun run build
```

## Acceptance Criteria

- PR/branch CI 穩定。
- CI 失敗時能定位是 typecheck、unit、build 或 binary e2e。
- CI 不需要 provider credentials。
- fork PR 以 read-only token/最小 permissions 執行，不執行 untrusted code with release secrets。

## Learning Focus

- production CLI 的 CI gate。
- 把本機驗收指令變成可重複的 automation。

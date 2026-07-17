# 037 - Production Readiness Gate

## Goal

做最後 production readiness audit，確認 CLI 可以作為正式可用產品發布。

## Working State

完成後可以標記第一個 production-ready release。

## Scope

包含：

- end-to-end release rehearsal
- install channel verification
- provider live smoke matrix
- analyzer fixture matrix
- privacy/security audit
- performance limits
- backward compatibility checks
- schema compatibility checks
- agent protocol smoke
- known issues / release notes

不包含：

- 新功能
- 大型 refactor
- unsupported platform support

## Production Checklist

- `bun run typecheck`
- `bun run test`
- `bun run build`
- binary e2e tests
- provider live smoke：OpenAI、Anthropic、local CLI（cloud providers 明確使用 `cloud-allowed`，
  並由 gated release environment 提供 credentials/budget）
- privacy local-only smoke
- session cleanup / retention smoke
- agent NDJSON smoke：success、no changes、provider error、interrupted
- analyzer smoke：TypeScript、Python、Go、Rust
- Homebrew install smoke
- npm install smoke on supported platforms
- update check smoke
- signed update manifest tamper/rollback/self-update recovery smoke
- signed macOS artifact verification
- docs command smoke

## Verification

```bash
bun run typecheck
bun run test
bun run build
bun run package:release
./dist/reviewstuff doctor --json
./dist/reviewstuff review --engine fake --json
```

## Acceptance Criteria

- release checklist 全部通過或有明確 documented exception。
- security、data loss、artifact authenticity、schema corruption、default privacy 與 supported
  install channel failures 是 release blockers，不可用 documented exception waive；只有
  non-critical limitation 可附 owner、理由、到期日與 user-facing known issue 後接受。
- no known data-loss bugs。
- threat model 中所有已識別的 default-config secret leakage path 都有 mitigation/test；文件明確
  說明 secret detection 的 residual risk，不做「保證零洩漏」宣稱。
- install/update docs 和實際 artifacts 一致。
- current and previous schema fixtures can be read or produce clear migration errors。
- agent output contract is stable for success/no-change/error cases。
- production release notes 完成。
- tag/version、signed manifest、artifact checksum、macOS notarization、npm platform package 與
  Homebrew formula 都指向同一組 final release bytes/source commit。

## Learning Focus

- release readiness audit。
- 把「能跑」提升成「可放心發布」。

# 036 - Production Readiness Gate

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
- provider live smoke：OpenAI、Anthropic、local CLI
- privacy local-only smoke
- session cleanup / retention smoke
- agent NDJSON smoke：success、no changes、provider error、interrupted
- analyzer smoke：TypeScript、Python、Go、Rust
- Homebrew install smoke
- npm install smoke on supported platforms
- update check smoke
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
- no known data-loss bugs。
- no known secret leakage path in default config。
- install/update docs 和實際 artifacts 一致。
- current and previous schema fixtures can be read or produce clear migration errors。
- agent output contract is stable for success/no-change/error cases。
- production release notes 完成。

## Learning Focus

- release readiness audit。
- 把「能跑」提升成「可放心發布」。

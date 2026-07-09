# 012 - Multi Platform Builds

## Goal

把 Bun standalone build 從 macOS arm64 擴展到更多平台。

多平台 build 的目標是讓非 TypeScript/Node 生態的使用者也能用同一個 CLI。每個 target 都應該產生可直接執行的 standalone artifact，再由 Homebrew/npm/install script 選擇正確平台。

## Depends On

- 008 - Release Artifact Layout

## Scope

Targets:

```text
bun-darwin-arm64
bun-darwin-x64
bun-linux-x64
bun-linux-arm64
bun-windows-x64
```

## Implementation

Generalize `scripts/build-bun.mjs`:

```bash
bun run scripts/build-bun.mjs --target bun-darwin-arm64
bun run scripts/build-bun.mjs --target bun-linux-x64
```

Output:

```text
dist/reviewstuff-darwin-arm64
dist/reviewstuff-linux-x64
dist/reviewstuff-windows-x64.exe
```

## Test Matrix

Minimum smoke per target:

```bash
reviewstuff --version
reviewstuff --help
AI_REVIEW_FAKE_ENGINE=1 reviewstuff --staged --json
```

## Acceptance Criteria

- Build script can build one target or all targets.
- Release manifest supports multiple targets.
- Platform-specific file extensions are correct.
- Windows console behavior is explicitly tested before release.
- Every platform artifact follows the 008 release manifest schema.
- Platform selection is based on OS/CPU metadata, not on language ecosystem assumptions.

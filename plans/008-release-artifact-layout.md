# 008 - Release Artifact Layout

## Goal

定義 production release artifact 的檔名、metadata、checksum，讓後續 Homebrew、自動更新、手動下載都使用同一套格式。

這份 plan 也定義一個長期原則：GitHub Release 上的 standalone binary/tarball 是唯一正式 runtime artifact。Homebrew、npm wrapper、curl install script 都必須安裝同一份 artifact 或從同一個 release pipeline 產物派生，不各自打包 Node-style runtime。

## Working State

做完這份 plan 後，可以產生一份可手動下載、校驗、解壓、執行的 release tarball。這還不是完整產品化發佈，但已經有穩定 artifact layout 供後續安裝通道使用。

## Depends On

- 001 - Bun Standalone MVP
- 002 - Binary Test Harness

## Scope

包含：

- tarball layout。
- checksums。
- release metadata JSON。

不包含：

- codesign。
- notarization。
- GitHub Actions。
- Homebrew formula。
- npm wrapper package。
- 多平台 build matrix。

## Artifact Layout

For macOS arm64:

```text
dist/release/
  reviewstuff-vX.Y.Z-darwin-arm64/
    reviewstuff
    README.txt
    build-info.json
  reviewstuff-vX.Y.Z-darwin-arm64.tar.gz
  reviewstuff-vX.Y.Z-darwin-arm64.tar.gz.sha256
  SHA256SUMS
  manifest.json
```

Tarball contents must not require Node, Bun, or package manager state at runtime.

## Manifest

```ts
interface ReleaseManifestV1 {
  version: string
  createdAt: string
  runtime: "bun-standalone"
  artifacts: Array<{
    target: "darwin-arm64"
    os: "darwin"
    arch: "arm64"
    filename: string
    executableName: "reviewstuff"
    sha256: string
    sizeBytes: number
  }>
}
```

## Implementation

Add:

```text
scripts/package-release.mjs
```

Package script:

```json
"package:release": "bun run scripts/package-release.mjs"
```

## Verification

```bash
pnpm build
pnpm package:release
shasum -a 256 dist/release/reviewstuff-vX.Y.Z-darwin-arm64.tar.gz
tar -tzf dist/release/reviewstuff-vX.Y.Z-darwin-arm64.tar.gz
```

## Acceptance Criteria

- Tarball contains executable `reviewstuff`.
- Checksum file matches tarball.
- Manifest includes version, runtime, target, os, arch, size, sha256.
- No release artifact requires `node`, `bun`, or npm dependencies at runtime.

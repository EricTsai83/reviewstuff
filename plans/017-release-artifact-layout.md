# 017 - Release Artifact Layout

## Goal

定義正式 release artifact layout，讓手動下載、Homebrew、npm wrapper 都使用同一份 binary。

## Working State

完成後可以產生：

```text
dist/release/reviewstuff-vX.Y.Z-darwin-arm64.tar.gz
dist/release/SHA256SUMS
dist/release/manifest.json
```

## Scope

包含：

- package release script
- tarball layout
- checksum
- manifest schema
- build-info metadata

不包含：

- codesign
- Homebrew
- npm package

## Manifest

```ts
interface ReleaseManifestV1 {
  version: string
  runtime: "bun-standalone"
  artifacts: Array<{
    target: string
    os: string
    arch: string
    filename: string
    sha256: string
    sizeBytes: number
  }>
}
```

## Verification

```bash
bun run build
bun run package:release
shasum -a 256 dist/release/*.tar.gz
tar -tzf dist/release/*.tar.gz
```

## Acceptance Criteria

- tarball 裡有 executable。
- checksum 可驗。
- manifest 可供後續 install channels 使用。

## Learning Focus

- release artifact layout。
- checksum 與 manifest 如何支撐 Homebrew/npm wrapper。

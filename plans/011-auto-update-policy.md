# 011 - Auto Update Policy

## Goal

規劃 binary 自我更新，但不在早期 MVP 強制加入。這是 production convenience，不是 local dev 必要能力。

## Depends On

- 008 - Release Artifact Layout

## Scope

包含：

- update command。
- version check endpoint/file。
- Homebrew detection。

不包含：

- background daemon。
- silent updates。

## Command

```bash
reviewstuff update
reviewstuff update --check
```

## Policy

- If installed by Homebrew, print:

```text
This installation is managed by Homebrew. Run: brew upgrade reviewstuff
```

- If symlinked local dev install, print:

```text
This appears to be a local development install. Rebuild with: pnpm build
```

- Only self-update direct release tarball installs.

## Manifest

Use `manifest.json` from plan 008:

```json
{
  "version": "0.2.0",
  "artifacts": [
    {
      "target": "darwin-arm64",
      "filename": "reviewstuff-darwin-arm64.tar.gz",
      "sha256": "..."
    }
  ]
}
```

## Acceptance Criteria

- `update --check` reports current/latest.
- Homebrew installs are not self-mutated.
- Downloaded artifact checksum is verified before replacement.
- Replacement is atomic.

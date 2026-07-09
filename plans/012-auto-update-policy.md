# 012 - Auto Update Policy

## Goal

規劃 binary 自我更新，但不在早期 MVP 強制加入。這是 production convenience，不是 local dev 必要能力。

## Working State

做完這份 plan 後，direct release install 可以檢查更新並安全替換 binary；Homebrew 和 local symlink install 只會收到正確指引，不會被 CLI 自行改動。

## Depends On

- 009 - Release Artifact Layout

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
reviewstuff update --dry-run
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

Use `manifest.json` from plan 009:

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

## Verification

```bash
reviewstuff update --check
REVIEWSTUFF_UPDATE_MANIFEST_URL=http://127.0.0.1:<port>/manifest.json reviewstuff update --check
REVIEWSTUFF_UPDATE_MANIFEST_URL=http://127.0.0.1:<port>/manifest.json reviewstuff update --dry-run
```

Test installation detection cases:

```text
local symlink install
Homebrew install
direct tarball install
```

## Acceptance Criteria

- `update --check` reports current/latest.
- Homebrew installs are not self-mutated.
- Downloaded artifact checksum is verified before replacement.
- Replacement is atomic.

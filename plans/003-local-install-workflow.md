# 003 - Local Install Workflow

## Goal

讓開發者可以把本機 build 出來的 binary 安裝成 Terminal 指令：

```bash
reviewstuff --help
```

## Depends On

- 001 - Bun Standalone MVP

## Scope

包含：

- 新增 local install script。
- symlink 到 `~/.local/bin/reviewstuff`。
- README 文件。

不包含：

- npm global install。
- Homebrew。
- auto-update。

## Implementation

### 1. Add `scripts/install-local.mjs`

流程：

1. Resolve repo root from script location.
2. Verify `dist/reviewstuff` exists.
3. Verify executable bit.
4. Create `~/.local/bin`.
5. Replace existing symlink/file only if:
   - it is already symlink to this repo, or
   - user passes `--force`.
6. Create symlink:

```text
~/.local/bin/reviewstuff -> <repo>/dist/reviewstuff
```

7. Print PATH guidance if `~/.local/bin` is not in `PATH`.

### 2. Add Package Script

```json
"install:local": "bun run scripts/install-local.mjs"
```

### 3. README

Add:

```bash
pnpm build
pnpm install:local
reviewstuff --help
```

## Verification

```bash
pnpm build
pnpm install:local
~/.local/bin/reviewstuff --version
```

## Acceptance Criteria

- `pnpm install:local` creates a symlink.
- Re-running it is idempotent.
- It does not overwrite unrelated files unless `--force`.
- It prints clear PATH guidance.

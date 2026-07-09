# 014 - NPM Binary Wrapper

## Goal

讓 npm/pnpm/yarn 成為 ReviewStuff 的安裝管道，但不改變 runtime artifact 策略：正式執行檔仍然是 Bun standalone binary。

## Working State

做完這份 plan 後，使用者可以透過 npm ecosystem 安裝 `reviewstuff`，但實際執行的仍是 release pipeline 產生的 standalone binary。

目標使用方式：

```bash
npm install -g reviewstuff
reviewstuff --version
```

或：

```bash
pnpm dlx reviewstuff --help
```

## Depends On

- 008 - Release Artifact Layout

## Scope

包含：

- npm package layout。
- platform package strategy。
- install-time platform selection。
- `bin` command exposure。

不包含：

- 重新引入 Node-style `dist/cli.mjs` 作為主要 runtime。
- Homebrew formula。
- auto-update。
- telemetry。

## Design Decision

NPM package 是安裝通道，不是主要 runtime。

Preferred model:

```text
reviewstuff
  convenience/meta package

@reviewstuff/darwin-arm64
  contains native binary for macOS arm64

@reviewstuff/darwin-x64
  contains native binary for macOS Intel

@reviewstuff/linux-x64
  contains native binary for Linux x64
```

Platform packages should use npm `os` and `cpu` fields. The first implementation may only publish `@reviewstuff/darwin-arm64`.

Each platform package should expose the command name `reviewstuff` too, so advanced users can install a platform package directly if needed:

```bash
npm install -g @reviewstuff/darwin-arm64
```

## Runtime Rule

Running `reviewstuff` should execute the standalone binary whenever feasible.

Allowed npm-specific tradeoff:

- A small install-time script may copy or link the selected platform binary into the meta package `bin/reviewstuff`.
- A small JS shim is acceptable only as a fallback with a clear error if platform binary installation failed.

Disallowed:

- Requiring users to run `node dist/cli.mjs`.
- Publishing a package whose main behavior diverges from the GitHub Release binary.
- Rebuilding the CLI from source during npm install.

## Package Layout

```text
packages/npm/reviewstuff/
  package.json
  scripts/install.mjs
  bin/reviewstuff

packages/npm/reviewstuff-darwin-arm64/
  package.json
  bin/reviewstuff
```

Meta package `package.json`:

```json
{
  "name": "reviewstuff",
  "bin": {
    "reviewstuff": "bin/reviewstuff"
  },
  "optionalDependencies": {
    "@reviewstuff/darwin-arm64": "X.Y.Z"
  }
}
```

Platform package `package.json`:

```json
{
  "name": "@reviewstuff/darwin-arm64",
  "bin": {
    "reviewstuff": "bin/reviewstuff"
  },
  "os": ["darwin"],
  "cpu": ["arm64"],
  "files": ["bin/reviewstuff"]
}
```

## Verification

```bash
pnpm build
pnpm package:release
pnpm --filter @reviewstuff/darwin-arm64 pack --pack-destination /tmp/reviewstuff-pack
pnpm --filter reviewstuff pack --pack-destination /tmp/reviewstuff-pack
npm install -g /tmp/reviewstuff-pack/reviewstuff-*.tgz /tmp/reviewstuff-pack/reviewstuff-darwin-arm64-*.tgz
reviewstuff --version
reviewstuff --help
file "$(command -v reviewstuff)"
```

## Acceptance Criteria

- `npm install -g reviewstuff` exposes `reviewstuff` on PATH.
- The executed command resolves to a standalone binary on supported platforms.
- Unsupported platforms fail with an actionable message.
- Package version and binary version match.
- NPM package uses the same binary produced by the release pipeline.

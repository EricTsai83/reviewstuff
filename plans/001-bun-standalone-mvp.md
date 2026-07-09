# 001 - Bun Standalone MVP

## Goal

把目前 Node-style `dist/cli.mjs` CLI 改成 Bun standalone executable，第一階段只支援 macOS arm64。

這個階段的 product decision 是：ReviewStuff 的正式 runtime artifact 先對齊 CodeRabbit-style binary，而不是要求使用者在目標機器上安裝 Node 或 Bun。Source code 可以繼續用 TypeScript；distribution artifact 要是可直接執行的 native platform executable。

目標產物：

```text
dist/reviewstuff
```

執行方式：

```bash
./dist/reviewstuff --help
```

## Working State

做完這份 plan 後，本機可以直接執行 `./dist/reviewstuff`。這個 binary 不需要用 `node` 或 `bun` 啟動，至少 `--help`、`--version` 和 fake-engine review path 要能正常運作。

## Scope

包含：

- 修掉 Bun compile 後讀不到 `package.json` 的問題。
- 新增 Bun compile build script。
- 更新 `package.json` 的 primary `build` 與 `bin`。
- 保留 Node build fallback。
- 更新 README 開發段落。

不包含：

- Homebrew。
- codesign/notarization。
- auto-update。
- multi-platform build。
- review session/fix iteration 改造。
- npm/Homebrew/install script distribution。
- 多語言 analyzer/plugin 架構。

## Implementation

### 1. Update `src/cli.ts`

移除：

```ts
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = require("../package.json") as { version: string }
```

改成：

```ts
import pkg from "../package.json" with { type: "json" }
```

保留：

```ts
program.version(pkg.version)
```

原因：Bun standalone 會把 JSON import bundle 進 binary，但 runtime `createRequire("../package.json")` 會在 `/$bunfs/root/...` 找不到檔案。

### 2. Add `scripts/build-bun.mjs`

功能：

1. 刪除舊的 `dist/reviewstuff`。
2. 確認 `bun --version` 可執行。
3. 執行：

```bash
bun build src/cli.ts \
  --compile \
  --target=bun-darwin-arm64 \
  --outfile=dist/reviewstuff
```

4. `chmod 755 dist/reviewstuff`
5. smoke check：

```bash
dist/reviewstuff --version
dist/reviewstuff --help
```

任何一步失敗都讓 script exit non-zero。

### 3. Update `package.json`

改：

```json
"bin": {
  "reviewstuff": "dist/reviewstuff"
}
```

改 scripts：

```json
{
  "build": "bun run scripts/build-bun.mjs",
  "build:bun": "bun run scripts/build-bun.mjs",
  "build:node": "tsdown",
  "dev": "bun src/cli.ts"
}
```

保留：

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

### 4. Update README

把開發段落改成：

```bash
pnpm dev -- --help
pnpm typecheck
pnpm test
pnpm build
./dist/reviewstuff --help
```

補一句：

```text
pnpm build 會產生 Bun standalone executable；執行 dist/reviewstuff 不需要使用者安裝 Node 或 Bun。
```

## Verification

```bash
pnpm typecheck
pnpm build
./dist/reviewstuff --version
./dist/reviewstuff --help
file dist/reviewstuff
```

Expected:

```text
Mach-O 64-bit executable arm64
```

## Acceptance Criteria

- `pnpm build` creates `dist/reviewstuff`.
- `./dist/reviewstuff --version` prints package version.
- `./dist/reviewstuff --help` works.
- `file dist/reviewstuff` says `Mach-O 64-bit executable arm64`.
- Built artifact does not require invoking `node`.
- Built artifact does not require the target machine to have `bun` installed.

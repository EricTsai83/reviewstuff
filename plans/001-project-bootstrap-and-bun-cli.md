# 001 - Project Bootstrap And Bun CLI

## Goal

從空 repo 建立最小 TypeScript CLI，並能 build 成 Bun standalone executable。

## Working State

完成後可以執行：

```bash
pnpm build
./dist/reviewstuff --version
./dist/reviewstuff --help
```

目標機器執行 `dist/reviewstuff` 不需要安裝 Node 或 Bun。

## Scope

包含：

- `package.json`
- `tsconfig.json`
- `.gitignore`
- `src/cli.ts`
- `scripts/build-bun.mjs`
- 最小 README
- `reviewstuff --version`
- `reviewstuff --help`
- `reviewstuff review --help`
- `reviewstuff doctor --help`

不包含：

- 真正 review git diff
- test harness
- session storage
- provider engine

## Implementation Steps

1. 建立 TypeScript/Bun 專案設定。
2. 使用 `commander` 建立 CLI。
3. 用 JSON import 讀 package version，不使用 runtime `createRequire("../package.json")`。
4. 新增 build script：

```bash
bun build src/cli.ts --compile --target=bun-darwin-arm64 --outfile=dist/reviewstuff
```

5. build script 要執行 smoke check：`--version`、`--help`。

## Verification

```bash
pnpm install
pnpm typecheck
pnpm build
./dist/reviewstuff --version
./dist/reviewstuff --help
file dist/reviewstuff
```

## Acceptance Criteria

- `dist/reviewstuff` 存在且可執行。
- `file dist/reviewstuff` 顯示 macOS arm64 executable。
- CLI 不需要透過 `node` 啟動。
- 這階段沒有 review 行為，只建立可執行骨架。


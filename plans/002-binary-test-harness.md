# 002 - Binary Test Harness

## Goal

讓現有 e2e 測試直接執行 Bun standalone binary，而不是用 `node dist/cli.mjs`。

## Working State

做完這份 plan 後，`pnpm test` 會驗證實際 shipping binary。未來只要 binary build 壞掉，e2e 測試要能抓到，不再只測 Node-style output。

## Depends On

- 001 - Bun Standalone MVP

## Scope

包含：

- 更新 `test/e2e/cli.e2e.test.ts`。
- 新增 binary smoke assertions。
- 確保 fake engine workflow 繼續可用。

不包含：

- CI provider 設定。
- release artifact 上傳。

## Implementation

### 1. Update Binary Path

改：

```ts
const CLI = path.resolve(__dirname, "../../dist/cli.mjs")
```

成：

```ts
const CLI = path.resolve(__dirname, "../../dist/reviewstuff")
```

### 2. Execute Binary Directly

改：

```ts
execFileSync("node", [CLI, ...args], ...)
```

成：

```ts
execFileSync(CLI, args, ...)
```

所有測試都保留：

```ts
env: { ...process.env, AI_REVIEW_FAKE_ENGINE: "1" }
```

### 3. Update Test Description

改為：

```text
binary e2e（dist/reviewstuff Bun standalone + AI_REVIEW_FAKE_ENGINE=1）
```

### 4. Add Smoke Test

新增一個 test：

```ts
it("--version works from standalone binary", () => {
  const result = runCli("--version")
  expect(result.exitCode).toBe(0)
  expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
})
```

## Verification

```bash
pnpm build
pnpm test
```

## Acceptance Criteria

- e2e tests no longer invoke `node`.
- `AI_REVIEW_FAKE_ENGINE=1` still works in compiled binary.
- Existing `--staged --json` contract still passes.
- Non-git repo still exits `2`.
- Unknown reviewer still exits `2`.

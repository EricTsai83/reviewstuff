# 002 - Binary Test Harness

## Goal

建立測試基礎，並確保 e2e 測試直接執行 compiled binary。

## Working State

完成後 `bun run test` 會先 build binary，再用 `execFileSync(dist/reviewstuff, args)` 測試 CLI。

## Scope

包含：

- Vitest 設定。
- e2e helper。
- `--version`、`--help` smoke tests。
- non-git / unknown command 基本測試。

不包含：

- 真正 review。
- provider integration。
- CI workflow。

## Implementation Steps

1. 新增 `vitest.config.ts`。
2. 新增 `test/e2e/cli.e2e.test.ts`。
3. 測試 helper 必須直接執行 `dist/reviewstuff`。
4. package scripts 加入：

```json
{
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

## Verification

```bash
bun run typecheck
bun run build
bun run test
```

## Acceptance Criteria

- e2e 不呼叫 `node dist/...`。
- binary smoke tests 穩定通過。
- 測試失敗時能清楚看到 stdout/stderr/exit code。

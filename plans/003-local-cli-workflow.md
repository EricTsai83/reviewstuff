# 003 - Local CLI Workflow

## Goal

日常開發直接執行專案內的 compiled binary，不安裝或連結到全域 PATH。

## Working State

完成後可以執行：

```bash
bun run build
bun run cli:local --help
```

## Scope

包含：

- `bun run cli:local`
- 直接執行 `dist/reviewstuff`
- 由既有 binary e2e tests 驗證 compiled binary

不包含：

- 寫入 `~/.local/bin`
- 永久 symlink
- Homebrew
- npm global install
- auto-update

## Implementation Steps

1. 在 `package.json` 提供 `cli:local`，直接指向 `dist/reviewstuff`。
2. 讓 `bun run cli:local -- <args>` 將參數傳給 compiled binary。
3. PATH 行為若有測試需求，使用測試專屬的暫存目錄與單次 PATH，不改動使用者環境。
4. 正式安裝流程留給 release package manager，不和開發流程混在一起。

## Verification

```bash
bun run build
bun run cli:local --version
bun test test/e2e/cli.e2e.test.ts
```

## Acceptance Criteria

- local CLI 可以接收與 compiled binary 相同的參數。
- 日常 local 執行不建立全域 link，也不修改 PATH。
- production 安裝不會被開發版覆蓋。
- compiled binary 的 e2e tests 可以從任意 working directory 執行它。

## Learning Focus

- 將開發入口與 production 安裝分開。
- 用 process-scoped PATH 測試取代會留下狀態的全域 link。

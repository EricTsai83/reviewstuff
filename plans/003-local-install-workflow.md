# 003 - Local Install Workflow

## Goal

讓開發者可以把本機 build 出來的 binary 安裝成 terminal command。

## Working State

完成後可以執行：

```bash
bun run build
bun run install:local
reviewstuff --help
bun run uninstall:local
```

## Scope

包含：

- `scripts/install-local.ts`
- `scripts/uninstall-local.ts`
- `bun run install:local`
- `bun run uninstall:local`
- symlink 到 `~/.local/bin/reviewstuff`
- PATH guidance

不包含：

- Homebrew
- npm global install
- auto-update

## Implementation Steps

1. 確認 `dist/reviewstuff` 存在且可執行。
2. 建立 `~/.local/bin`。
3. 建立 symlink。
4. 若目標已存在且不是指向此 repo，除非 `--force` 否則拒絕覆蓋。
5. 若 `~/.local/bin` 不在 PATH，印出修正建議。
6. uninstall 只移除指向此 repo 的 symlink；若不存在則成功結束，其他內容一律拒絕移除。

## Verification

```bash
bun run build
bun run install:local
~/.local/bin/reviewstuff --version
reviewstuff --help
bun run uninstall:local
test ! -e ~/.local/bin/reviewstuff
```

## Acceptance Criteria

- local install 可重複執行。
- local uninstall 可重複執行。
- 不覆蓋 unrelated file。
- uninstall 不移除 unrelated file 或 symlink。
- 使用者可以用 `reviewstuff` 指令跑本機 binary。

## Learning Focus

- 本機 CLI symlink 安裝流程。
- 安全處理既有檔案、uninstall ownership 與 PATH guidance。

# 004 - Repository Structure Boundaries

## Goal

在功能變多前先固定 module 邊界，避免 CLI command 檔變成所有邏輯的集中地。

## Working State

完成後 CLI 行為不變，但 repo 有清楚結構：

```text
src/
  cli.ts
  commands/
  use-cases/
  domain/
  git/
  engines/
  review/
  output/
  config/
  shared/
```

## Scope

包含：

- `docs/repository-structure.md`
- `src/use-cases/`
- command/use-case/domain/service 邊界說明
- 將最小 `review` command 委派給 use-case，即使 use-case 暫時只回傳 placeholder

不包含：

- 真正 git diff review
- storage
- analyzers
- deep review

## Boundaries

- `commands/`: 只處理 CLI flags、usage errors、rendering。
- `use-cases/`: 負責 application flow。
- `domain/`: 純型別、schema、domain rules。
- `git/`, `engines/`, `storage/`: 外部系統邊界。

## Verification

```bash
bun run typecheck
bun run test
bun run build
./dist/reviewstuff review --help
```

## Acceptance Criteria

- `commands/` 沒有大型流程邏輯。
- `docs/repository-structure.md` 清楚描述 module ownership。
- 後續 plan 有明確落點。

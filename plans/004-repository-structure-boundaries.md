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
  platform/
  output/
  config/
  shared/
```

## Scope

包含：

- `docs/repository-structure.md`
- `src/use-cases/`
- `src/platform/command-runner.ts`
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
- `platform/`: Effect platform services、Command runner、filesystem/time abstractions。
- `git/`, `engines/`, `storage/`: 外部系統邊界，只透過 `platform/` 的受控 wrapper 執行副作用。

## Verification

```bash
bun run typecheck
bun run test
bun run build
./dist/reviewstuff review --help
```

## Acceptance Criteria

- `commands/` 沒有大型流程邏輯。
- 外部 command runner 邊界存在，且以 `@effect/platform/Command` 為實作方向。
- `docs/repository-structure.md` 清楚描述 module ownership。
- 後續 plan 有明確落點。

## Learning Focus

- thin command / use-case / domain / platform 的責任切分。
- 在還沒有大量功能前先固定 module ownership。

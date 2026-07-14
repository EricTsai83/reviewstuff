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
  platform/
```

這一階段只建立已經有實際使用者的目錄。`domain/`、`git/`、`engines/`、
`review/`、`output/`、`config/`、`storage/` 等 ownership 先記錄在文件中，等對應
plan 出現第一個真實需求時再建立，避免用空目錄和 pass-through implementation
假裝邊界已經成熟。

## Scope

包含：

- `docs/repository-structure.md`
- `src/use-cases/`
- `src/platform/command-runner.ts`
- `test/architecture/module-boundaries.test.ts`
- command/use-case/domain/service 邊界說明
- 將 CLI command definitions 移出 composition root
- 將最小 `review` command 委派給 `runReview` use-case；use-case 暫時只回傳
  semantic `void`，placeholder 文案仍由 command 負責
- 只定義 `CommandRunner` port 與 future-safe request/result/error contract；canonical
  `@effect/platform/Command` implementation 與 layer 延後到 005 的第一個真實 subprocess use case，屆時仍留在 `platform/command-runner.ts`

不包含：

- 真正 git diff review
- storage
- analyzers
- deep review
- command execution production implementation

## Boundaries

- `commands/`: 只處理 CLI flags、usage errors、呼叫 use-case、選擇 renderer，以及
  stdout/stderr rendering；不包含 application flow。
- `use-cases/`: 負責 application flow。
- `domain/`: 純型別、schema、domain rules。
- `platform/`: Effect platform services、Command runner、filesystem/time abstractions。
- `git/`, `engines/`, `storage/`: semantic service boundary；concrete implementation 只透過
  `platform/` 的受控 wrapper 執行副作用。
- use-case 只依賴 semantic services，不得直接 import `platform/`、`output/`、
  `@effect/platform` 或 runtime API。
- use-case 回傳 domain/application result；human/JSON/NDJSON formatting 屬於
  `commands/` 與 `output/`。
- `cli.ts` 是唯一 composition root，負責組合 `AppLive` 與 runtime。

## Verification

```bash
bun run typecheck
bun run test
bun run build
./dist/reviewstuff review --help
./dist/reviewstuff review
```

## Acceptance Criteria

- `commands/` 沒有大型流程邏輯。
- `runReview` 不回傳 CLI 顯示文案，且 error channel 不使用寬泛的 `Error`。
- `CommandRunner` port 有明確的 timeout、output limit、stdout/stderr、exit-code
  contract，但這一階段沒有未經測試的 production implementation。
- `docs/repository-structure.md` 清楚描述 module ownership。
- architecture test 會阻止 domain/use-case/command 繞過依賴方向，以及 feature
  code 直接使用 platform/runtime subprocess API。
- 後續 plan 有明確落點。

## Learning Focus

- thin command / use-case / domain / platform 的責任切分。
- 在還沒有大量功能前先固定 module ownership。

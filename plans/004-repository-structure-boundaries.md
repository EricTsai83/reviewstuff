# 004 - Repository Structure Boundaries

## Goal

在加入 session storage、findings replay、fix iteration、多語言 adapters 之前，先整理 repo 的模組邊界。

目標不是大規模重構，而是避免 `src/commands/*` 繼續承擔 use-case、storage、review orchestration、rendering 等混合責任。

## Working State

做完這份 plan 後，既有 CLI 行為不變，但 repo 會有清楚的長期結構方向：

- `commands/` 只負責 CLI flags、usage errors、呼叫 use-case、render output。
- `use-cases/` 負責 application flow。
- `domain/` 保存純資料型別與 domain rules。
- `storage/`、`languages/`、`analyzers/`、`agentic/` 有明確落點供後續 plans 使用。

## Depends On

- 003 - Local Install Workflow

## Scope

包含：

- 建立 repo structure guideline。
- 新增 `src/use-cases/`。
- 將 review 主流程從 `commands/review.ts` 移到 use-case 層。
- 確認 command 檔不直接承擔 storage/schema/pipeline 實作。
- 保留現有 public CLI behavior。

不包含：

- 實作 session storage。
- 多語言 adapters。
- analyzer adapters。
- deep review agent。
- 大規模 rename `reviewers/` 或 `review/`。

## Target Structure

長期目標：

```text
src/
  cli.ts
  commands/
  use-cases/
  domain/
  storage/
  git/
  engines/
  review/
  languages/
  analyzers/
  prompts/
  agentic/
  output/
  config/
  context/
  shared/
```

Near-term structure after this plan:

```text
src/
  commands/
    review.ts
    fix.ts
    doctor.ts
  use-cases/
    run-review.ts
  review/
  reviewers/
  output/
```

`reviewers/` can remain for now. 016 can later split prompt reviewers into `prompts/reviewers/` when language adapters are introduced.

## Boundaries

### `commands/`

Allowed:

- Convert CLI flags into typed use-case input.
- Map usage errors to exit codes.
- Call renderers.
- Print user-facing messages.

Not allowed:

- Own review pipeline logic.
- Own storage schema.
- Write session files directly.
- Run analyzers directly.
- Build prompts directly.

### `use-cases/`

Allowed:

- Orchestrate application flow.
- Call git/config/context/review/storage services.
- Return structured result for command rendering.

Not allowed:

- Parse CLI-specific string flags directly when a command can normalize them first.
- Write terminal output directly unless explicitly returning progress events.

### `domain/`

Allowed:

- Versioned schemas.
- Pure rules such as severity ordering, fingerprints, exit-code policy.

Not allowed:

- Filesystem access.
- Process execution.
- Provider-specific SDK calls.

## Implementation

Add:

```text
src/use-cases/run-review.ts
docs/repository-structure.md
```

Move most of `reviewCommand` flow into `runReview`.

Suggested shape:

```ts
interface RunReviewInput {
  staged?: boolean
  since?: string
  file?: readonly string[]
  profile?: Profile
  reviewers?: readonly string[]
  model?: string
  engine?: "pi" | "claude" | "codex"
  verify?: boolean
  updateBaseline?: boolean
  failOn?: FailOn
  config?: string
  timeout?: number
  concurrency?: number
}

interface RunReviewResult {
  report: Report
  renderedJson: string
  renderedTerminal: string
}
```

`commands/review.ts` should keep output handling:

- write `--output`
- choose stdout/stderr behavior for `--json`
- return exit code

## Guardrails

- Do not change command names, flags, default behavior, or exit codes.
- Do not change reviewer output schema.
- Do not introduce a framework-level abstraction that is not used by at least this review flow.
- Keep the refactor mechanical enough that test failures point to real behavior changes.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
./dist/reviewstuff --version
./dist/reviewstuff --help
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff --staged --json
```

## Acceptance Criteria

- Existing review behavior is unchanged.
- `commands/review.ts` is thinner and delegates core flow to `src/use-cases/run-review.ts`.
- `docs/repository-structure.md` documents the intended module boundaries.
- No new session/multi-language/deep-review behavior is implemented in this plan.
- Tests still pass against the standalone binary.

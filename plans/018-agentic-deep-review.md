# 018 - Agentic Deep Review

## Goal

引入 OpenReview-style 的 bounded tool-using review agent，作為 opt-in deep review mode：

```bash
reviewstuff review --staged --deep
reviewstuff review --since main --deep
```

這個 mode 用於重要 PR、複雜跨檔案變更、或需要看周邊程式碼與跑工具的 review。預設 `reviewstuff review` 仍應走較快、可預測的 deterministic review path。

## Working State

做完這份 plan 後，使用者可以 opt-in 執行 `reviewstuff review --deep`。Deep review 可以讀相關檔案、搜尋 repo、跑受控 analyzers、載入 skills，但最後仍輸出並保存 ReviewStuff structured findings。

## Reference

參考 `vercel-labs/openreview` commit:

```text
672deb21e70e471e0536d5ad7a67c14b8359e97e
```

可借鏡：

- Agent 一開始從 diff 出發。
- Agent 可用工具讀檔、搜尋、跑命令。
- Progressive skills：system prompt 只放 skill name/description，需要時才 `loadSkill`。
- Execution budget：max steps、token cap、tool result truncation。
- Review agent prompt 明確要求找 bugs/security/performance/code quality，而不是 nitpick style。

不可照搬：

- GitHub App。
- Vercel Workflow。
- Vercel Sandbox。
- `gh pr review` / `gh api` comments 作為核心輸出。
- 自動 commit/push。
- 任意 unrestricted shell。

ReviewStuff 的 deep review 產物必須是 structured findings，並保存到 005 的 session storage。

## Depends On

- 005 - Review Session Storage
- 008 - Agent JSON Protocol
- 016 - Language Agnostic Review Core
- 017 - External Analyzer Adapters

## Scope

包含：

- `--deep` flag。
- Deep review agent prompt。
- Bounded local tool loop。
- Progressive skill discovery/loading。
- Structured finding proposal/validation。
- Deep review events for `--agent` NDJSON。
- Session persistence。

不包含：

- Cloud sandbox。
- GitHub PR comments。
- GitHub App integration。
- Auto-apply fixes。
- Auto-commit or push。
- Remote execution。

## Command Shape

```bash
reviewstuff review --staged --deep
reviewstuff review --since main --deep
reviewstuff review --deep --budget quick
reviewstuff review --deep --budget thorough
reviewstuff review --deep --skill security-review
```

Initial budget presets:

```text
quick:
  maxSteps: 8
  maxTotalTokens: 60000
  maxToolOutputChars: 8000
  commandTimeoutMs: 30000

thorough:
  maxSteps: 20
  maxTotalTokens: 180000
  maxToolOutputChars: 12000
  commandTimeoutMs: 60000
```

## Architecture

```text
review command
  -> collect git diff / changed files
  -> detect languages
  -> collect baseline language context
  -> run configured analyzer adapters
  -> discover skills
  -> create deep review agent
  -> agent uses bounded tools
  -> agent submits proposed findings
  -> validate findings against schema and diff scope
  -> store findings in session
  -> render human / json / agent output
```

Default review and deep review share the same finding/session schema. Deep review only changes how findings are discovered.

## Tools

Do not expose raw shell as the primary interface. Start with narrow tools:

```text
gitDiff
listChangedFiles
readFile
search
runAnalyzer
runGate
loadSkill
proposeFinding
```

Tool behavior:

- `gitDiff`: returns bounded diff context for the selected scope.
- `listChangedFiles`: returns changed files with language metadata.
- `readFile`: reads repo files with file size and path safety limits.
- `search`: runs bounded `rg` searches.
- `runAnalyzer`: calls 017 analyzer adapters.
- `runGate`: runs configured validation gates with timeout.
- `loadSkill`: loads full skill text by name.
- `proposeFinding`: submits a structured finding candidate.

Raw shell may be added later behind an explicit flag:

```bash
reviewstuff review --deep --allow-shell
```

Even then it must use command allowlists, timeouts, and non-destructive defaults.

## Guardrails

Required limits:

- `maxSteps`
- `maxTotalTokens`
- `maxToolOutputChars`
- `maxFilesRead`
- `maxFileBytes`
- `commandTimeoutMs`
- `maxFindings`
- repo-root path containment

Required command rules:

- No destructive git commands.
- No network commands by default.
- No package install commands by default.
- No writes during `review --deep`.
- No source file changes unless the user runs `reviewstuff fix`.

Tool output over the limit must be truncated with an explicit note.

## Prompt Design

Base prompt should be local-first:

```text
You are an expert code reviewer working inside a local git repository.

Start from the provided diff and changed file list. Use tools only when they help verify a concrete issue.

Review for bugs, security vulnerabilities, performance regressions, missing error handling, race conditions, broken tests, and maintainability issues.

Do not nitpick style, formatting, or preferences unless they create a real defect.

Load relevant skills when the changed files or user request match a skill description.

Do not modify files in review mode.

Submit every issue with the proposeFinding tool. Each finding must include severity, file, line when known, title, rationale, evidence, and suggested fix.

If an issue cannot be tied to evidence in the diff or related code, do not report it.
```

Skill prompt:

```text
Available skills:
- <name>: <description>

Use loadSkill only when a skill is relevant to this review.
```

The full skill body is loaded on demand.

## Finding Validation

`proposeFinding` input:

```ts
interface ProposedFindingInput {
  language: LanguageId
  severity: "info" | "warning" | "error"
  fileName: string
  line?: number
  title: string
  rationale: string
  evidence: string[]
  suggestion?: string
  patch?: string
  confidence: "low" | "medium" | "high"
}
```

Validation rules:

- `fileName` must be inside repo root.
- Prefer findings on changed lines; allow related-file findings only when evidence explains the relationship.
- Reject empty rationale or evidence.
- Reject style-only findings unless the user explicitly asked for style review.
- Normalize into `ReviewFindingV1`.

## Agent JSON Events

When `--agent` is used with `--deep`, emit NDJSON events:

```json
{"type":"status","phase":"deep_review","status":"agent_started","budget":"quick"}
{"type":"agent_tool","tool":"search","status":"started"}
{"type":"agent_tool","tool":"search","status":"completed","truncated":false}
{"type":"finding","id":"...","language":"go","severity":"error","fileName":"main.go","title":"..."}
{"type":"status","phase":"deep_review","status":"agent_completed","steps":7}
```

Stdout remains valid NDJSON in agent mode. Human logs go to stderr.

## Skills

Discovery paths:

```text
.reviewstuff/skills/
.agents/skills/
<builtin skills directory>
```

Skill file format should be compatible with OpenReview-style `SKILL.md`:

```markdown
---
name: security-review
description: Use when reviewing authentication, authorization, secrets, crypto, or input validation changes.
---

# Security Review

...
```

Only `name` and `description` are loaded into the initial prompt.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --deep --agent | jq -c .
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff findings --json
```

Test fixtures:

```text
test/fixtures/repos/deep-review-cross-file
test/fixtures/repos/deep-review-skill-loading
test/fixtures/repos/deep-review-tool-budget
```

## Acceptance Criteria

- `review --deep` is opt-in and does not change default review behavior.
- Deep review starts from selected git diff scope.
- Agent tools are bounded by explicit budgets.
- Skills are discovered by name/description and full content is loaded only on demand.
- Deep review outputs structured findings stored in the normal session format.
- Deep review does not modify source files.
- `--agent` output remains valid NDJSON.
- Budget exhaustion returns partial findings rather than failing the whole review.

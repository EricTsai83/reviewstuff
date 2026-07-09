# 015 - Agentic Deep Review

## Goal

引入 OpenReview-style bounded tool-using agent，作為 opt-in deep review。

## Working State

完成後可用：

```bash
reviewstuff review --staged --deep
reviewstuff review --since main --deep
```

## Scope

包含：

- `--deep`
- bounded tool loop
- progressive skills
- `proposeFinding` structured output
- deep review NDJSON events

不包含：

- GitHub App
- Vercel Sandbox
- auto commit/push
- unrestricted shell

## Tools

先提供窄工具：

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

## Guardrails

- max steps
- token budget
- tool output cap
- file size cap
- command timeout
- repo-root path containment
- review mode 不改 source files

## Verification

```bash
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --deep --agent | jq -c .
```

## Acceptance Criteria

- `--deep` 不改變預設 review 行為。
- findings 仍保存到正常 session。
- budget 用完時回 partial result，不整體 crash。


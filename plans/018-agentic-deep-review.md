# 018 - Agentic Deep Review

## Goal

引入最小 bounded tool-using agent，作為 opt-in deep review 的第一步。

## Working State

完成後可用：

```bash
reviewstuff review --deep
```

## Scope

包含：

- `--deep`
- bounded tool loop
- `proposeFinding` structured output
- deep review NDJSON events
- readonly tools：`gitDiff`、`listChangedFiles`、`readFile`、`search`

不包含：

- progressive skills
- `runAnalyzer`
- `runGate`
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
proposeFinding
```

後續若加入 `runAnalyzer` 與 `runGate`，agent tool 只能依賴 analyzer/gate
semantic services；對應 concrete adapter 再透過既有 `CommandRunner` 執行 allowlisted
program。agent/use-case 不得直接取得 `CommandRunner`，也不得提供任意 shell 執行能力。

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
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --deep --agent | jq -c .
```

## Acceptance Criteria

- `--deep` 不改變預設 review 行為。
- findings 仍保存到正常 session。
- budget 用完時回 partial result，不整體 crash。

## Learning Focus

- agent loop 的最小控制面。
- 先做 readonly tools，避免一開始引入 command execution 風險。

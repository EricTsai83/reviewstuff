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
- scripted fake agent/tool-call fixtures

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
- repo content、diff、tool output 一律視為 untrusted data；不能讓其中的指令改寫 system policy、
  tool allowlist 或 budget
- engine/provider capability metadata 必須宣告支援 tool calling；不支援時清楚拒絕 `--deep`

## Verification

```bash
./dist/reviewstuff review --engine fake --deep --agent | jq -c .
```

## Acceptance Criteria

- `--deep` 不改變預設 review 行為。
- findings 仍保存到正常 session。
- budget 用完時回 partial result，不整體 crash。
- scripted fake engine 可 deterministic 驗證多步 tool call、path escape、oversized output 與 prompt-injection fixture。
- 不支援 tool calling 的 engine 會在執行前以 typed capability error 拒絕，不退回不受控行為。

## Learning Focus

- agent loop 的最小控制面。
- 先做 readonly tools，避免一開始引入 command execution 風險。

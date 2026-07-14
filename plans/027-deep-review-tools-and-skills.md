# 027 - Deep Review Tools And Skills

## Goal

把 deep review 從 readonly agent 擴展成 bounded tool-using reviewer。

## Working State

完成後可以執行：

```bash
reviewstuff review --deep --agent
```

deep review 可載入 skills、執行 analyzers/gates，並輸出 structured findings。

## Scope

包含：

- `runAnalyzer`
- `runGate`
- `loadSkill`
- skill discovery from `.reviewstuff/skills` and built-in skills
- tool output truncation
- max steps / token budget / cost budget
- deep review tool events in NDJSON

不包含：

- unrestricted shell
- writing source files during review
- remote sandbox
- GitHub PR comments

## Implementation Steps

1. 建立 tool registry 與 tool result schema。
2. 實作 `runAnalyzer` / `runGate` semantic services 與 tools；tool 只接受 typed
   allowlisted operation，不接受 executable 或 shell string。只有 live adapter 可透過
   `CommandRunner` 執行已註冊的 program。
3. 實作 skill frontmatter parser 與 `loadSkill`。
4. 將 tool output truncation 套到所有 tool results。
5. deep review findings 走正常 session storage。

## Verification

```bash
bun run test
AI_REVIEW_ENGINE=openai ./dist/reviewstuff review --deep --agent | jq -c .
```

## Acceptance Criteria

- agent 無法執行任意 shell。
- agent/use-case dependency graph 不包含 `CommandRunner` 或 platform services。
- tool calls 有 timeout/output cap/path containment。
- skills 只按需載入完整內容。
- budget 用完時回 partial result。

## Learning Focus

- OpenReview-style tools/skills 的 local CLI 版本。
- 安全地給 agent 更多能力。

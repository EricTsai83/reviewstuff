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
- built-in skill discovery；repo-local `.reviewstuff/skills` 需 explicit trust opt-in
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
   allowlisted operation，不接受 executable 或 shell string。只有 concrete adapter 可透過
   `CommandRunner` 執行已註冊的 program。
3. 實作 skill frontmatter parser 與 `loadSkill`。
   built-in skills 可預設載入 metadata；repo-local skills 視為 untrusted repository content，
   只有明確 flag/config opt-in 才能被發現，並記錄 canonical path + content hash。frontmatter、
   instruction size、symlink/path containment 與允許 tool/capability 都要驗證。
4. 將 tool output truncation 套到所有 tool results。
5. deep review findings 走正常 session storage。

## Verification

```bash
bun run test
OPENAI_API_KEY=<key> ./dist/reviewstuff review --engine openai --model <model-id> --deep --agent | jq -c .
```

## Acceptance Criteria

- agent 無法執行任意 shell。
- agent/use-case dependency graph 不包含 `CommandRunner` 或 platform services。
- tool calls 有 timeout/output cap/path containment。
- skills 只按需載入完整內容。
- repo-local skill 未 opt-in 時完全不可載入；skill 內容不能擴張 tool allowlist、path boundary 或 budget。
- budget 用完時回 partial result。

## Learning Focus

- OpenReview-style tools/skills 的 local CLI 版本。
- 安全地給 agent 更多能力。

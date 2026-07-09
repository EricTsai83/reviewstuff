# 008 - Agent JSON Protocol

## Goal

提供 agent-friendly NDJSON output，讓 Claude Code/Codex/其他 agent 可以穩定解析 review/fix 進度與 findings。

## Working State

做完這份 plan 後，`--agent` mode 的 stdout 每一行都是合法 JSON。其他 agent 或 CI 可以串接 ReviewStuff，而不用解析 human-readable terminal text。

## Depends On

- 005 - Review Session Storage

## Scope

包含：

- `--agent` flag。
- review/fix/findings structured events。
- heartbeat。

不包含：

- WebSocket。
- remote server。
- Deep review tool-loop semantics；018 extends this protocol with bounded agent/tool events.

## Review Events

Sequence:

```json
{"type":"review_context","sessionId":"...","reviewType":"staged","currentBranch":"main","workingDirectory":"/repo"}
{"type":"status","phase":"setup","status":"collecting_diff"}
{"type":"status","phase":"analyzing","status":"running_reviewers"}
{"type":"finding","id":"...","language":"typescript","severity":"error","fileName":"src/a.ts","codegenInstructions":"...","suggestions":["..."]}
{"type":"complete","status":"review_completed","sessionId":"...","findings":3,"reviewedFiles":["src/a.ts"]}
```

No-change:

```json
{"type":"complete","status":"review_skipped","findings":0,"message":"No changes detected"}
```

Heartbeat:

```json
{"type":"heartbeat","status":"reviewing"}
```

Emit every 45 seconds while reviewers are running.

## Fix Events

```json
{"type":"fix_context","sessionId":"...","findingIds":["..."]}
{"type":"status","phase":"fix","status":"generating_fixes"}
{"type":"status","phase":"validation","status":"running_gates"}
{"type":"fix_attempt","id":"...","status":"validated","files":["src/a.ts"],"allGreen":true}
{"type":"complete","status":"fix_completed","applied":true}
```

## Implementation

Add:

```text
src/output/agent.ts
```

Rules:

- Each event is one JSON object per line.
- stdout is reserved for NDJSON in agent mode.
- Human logs go to stderr or are suppressed.
- No ANSI formatting in agent mode.

## Verification

```bash
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff --staged --agent | jq -c .
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff fix --agent --dry-run | jq -c .
```

## Acceptance Criteria

- Every stdout line is valid JSON.
- Agent mode emits findings as they are available.
- Agent mode includes session id.
- Heartbeat interval is cleaned up when command exits.
- Finding events include language metadata when known.

# 011 - Agent JSON Protocol

## Goal

提供 agent/CI 可解析的 NDJSON output。

## Working State

完成後可用：

```bash
reviewstuff review --staged --agent
reviewstuff fix --dry-run --agent
```

stdout 每一行都是 JSON。

## Scope

包含：

- `src/output/agent.ts`
- review/fix status events
- finding events
- heartbeat
- stdout/stderr 分離

不包含：

- WebSocket
- remote server
- deep review tool events

## Implementation Steps

1. 定義 event schema。
2. `--agent` mode stdout 只輸出 NDJSON。
3. human logs 改走 stderr 或 suppressed。
4. 長任務每 45 秒 heartbeat。
5. command exit 時清掉 heartbeat timer。

## Verification

```bash
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --agent | jq -c .
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff fix --dry-run --agent | jq -c .
```

## Acceptance Criteria

- 每行都是合法 JSON。
- events 包含 session id。
- human output 不污染 stdout。

## Learning Focus

- CLI human output 與 machine-readable output 分離。
- NDJSON event schema 與 long-running command heartbeat。

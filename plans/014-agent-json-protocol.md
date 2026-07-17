# 014 - Agent JSON Protocol

## Goal

提供 agent/CI 可解析的 NDJSON output。

## Working State

完成後可用：

```bash
reviewstuff review --agent
reviewstuff fix --dry-run --agent
```

stdout 每一行都是 JSON。

## Scope

包含：

- `src/output/agent.ts`
- review/fix event schema：`review_context`、`status`、`finding`、`heartbeat`、`complete`、`error`
- finding fields：`severity`、`fileName`、`line`、`comment`、`codegenInstructions`、`suggestions`
- heartbeat
- stdout/stderr 分離
- no-change `review_skipped` event sequence
- stable exit code mapping for agent mode

不包含：

- WebSocket
- remote server
- deep review tool events

## Implementation Steps

1. 定義 versioned event schema。所有 event 共用
   `{ schemaVersion, type, sessionId, sequence, timestamp, payload }` envelope，`type` 是穩定
   discriminator；event-specific 欄位只放在 versioned payload。
2. `--agent` mode stdout 只輸出 NDJSON。
3. human logs 改走 stderr 或 suppressed。
4. review 開始時先輸出 `review_context`，包含 session id、scope、engine、model、repo metadata。
5. finding event 同時提供 human-readable `comment` 和 agent-oriented `codegenInstructions`；agent 優先用後者，缺少時 fallback `comment`。
6. no changes 時不呼叫 provider，輸出 `review_context`、`status: review_skipped`、`complete: review_skipped`。
7. 長任務每 45 秒 heartbeat。
8. command exit 時清掉 heartbeat timer。
9. 定義 agent mode exit code policy；`error` event 不取代 process exit code。每次正常、skipped
   或 handled failure 都只輸出一個 terminal `complete` event；signal path 盡力輸出
   `error`/`complete`，consumer 仍必須以 EOF + process exit code 判斷非正常中斷。

## Verification

```bash
./dist/reviewstuff review --engine fake --agent | jq -c .
./dist/reviewstuff fix --dry-run --engine fake --agent | jq -c .
```

## Acceptance Criteria

- 每行都是合法 JSON。
- events 包含 session id。
- human output 不污染 stdout。
- agent mode no-change path 有完整 `review_context` -> `status` -> `complete` sequence。
- `error` event 可表達 typed failure，且 process exit code 仍符合 CLI error policy。
- sequence 嚴格遞增，handled success/skipped/error path 各只有一個 terminal `complete` event。
- Ctrl-C 會停止 heartbeat，輸出可解析的 interrupted/error event，並清理暫存資源。

## Learning Focus

- CLI human output 與 machine-readable output 分離。
- NDJSON event schema 與 long-running command heartbeat。

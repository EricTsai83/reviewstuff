# 033 — Stream review events as NDJSON

[← Plan index](./README.md)

**Depends on:** 032。 **Learning:** process protocol and lifecycle。

**Working state:** `reviewstuff review --agent` 的 stdout只含 versioned NDJSON：context、status、finding、heartbeat、
complete/error。

**In:** event envelope/sequence、review success/no-change/handled-error flows、stderr separation、heartbeat scoped resource、
exit mapping。 **Out:** fix/deep-review tool events、WebSocket、resume protocol。

**架構決策：** use-case 依規則不得 import `output/`，因此 events 由 use-case 透過一個 event sink
service 發出，contract 放在 architecture test 已預留的 `agent/` boundary；`commands/` 提供 NDJSON
sink，human/`--json` path 提供 no-op sink。任何寫 stdout 的 code path（含 usage error）在 `--agent`
下都必須改走 stderr 或 NDJSON error event。

**Steps:** schema fixtures first；將 use-case milestones 映射到 sink events；用 Effect scoped fiber管理 heartbeat；signal/EOF tests；
human與 `--json` path保持不變。

**Accept:** every line decodes；sequence嚴格遞增；正常/skip/handled error各一個 terminal complete；Ctrl-C停止 heartbeat；
consumer仍以 process exit + EOF判斷 abrupt interruption。


# 033 — Stream review events as NDJSON

[← Plan index](./README.md)

**Depends on:** 032。 **Learning:** process protocol and lifecycle。

**Working state:** `reviewstuff review --agent` 的 stdout只含 versioned NDJSON：context、status、finding、heartbeat、
complete/error。

**In:** event envelope/sequence、review success/no-change/handled-error flows、stderr separation、heartbeat scoped resource、
exit mapping。 **Out:** fix/deep-review tool events、WebSocket、resume protocol。

**Steps:** schema fixtures first；將 use-case milestones映射 events；用 Effect scoped fiber管理 heartbeat；signal/EOF tests；
human與 `--json` path保持不變。

**Accept:** every line decodes；sequence嚴格遞增；正常/skip/handled error各一個 terminal complete；Ctrl-C停止 heartbeat；
consumer仍以 process exit + EOF判斷 abrupt interruption。


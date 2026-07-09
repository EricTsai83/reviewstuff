# 012 - Review Stats

## Goal

從 local review sessions 彙整可觀察的 review statistics，幫助使用者理解工具實際抓到什麼、修了什麼、花了多少成本。

## Working State

完成後可用：

```bash
reviewstuff stats
reviewstuff stats --rebuild
reviewstuff stats --json
```

## Scope

包含：

- `reviewstuff stats`
- `reviewstuff stats --rebuild`
- JSON output
- local session scan
- severity/category breakdown
- provider latency/cost summary when metadata exists
- fix attempt/apply summary when metadata exists

不包含：

- remote telemetry upload
- hosted dashboard
- team analytics
- billing integration

## Implementation Steps

1. 定義 `ReviewStatsV1` schema。
2. 從 `.reviewstuff/sessions` 掃描 sessions，聚合 findings、provider metadata、fix attempts。
3. 實作 cached stats file，`--rebuild` 強制重掃。
4. human output 顯示總 review 次數、findings severity breakdown、latest session、provider cost/latency summary。
5. JSON output 給 CI/agent 使用。

## Verification

```bash
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --json
./dist/reviewstuff stats
./dist/reviewstuff stats --json | jq .
./dist/reviewstuff stats --rebuild --json | jq .
```

## Acceptance Criteria

- stats 不呼叫 provider。
- missing or corrupt session 產生 warning，不使整體 command crash。
- `--rebuild` 可重建 cache。
- JSON schema 穩定。
- 不上傳 telemetry。

## Learning Focus

- local persisted data 如何支撐 product observability。
- aggregate schema 與 event/session schema 的差異。

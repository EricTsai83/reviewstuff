# 010 - Findings And Prompt Replay

## Goal

讓使用者不重跑模型也能查看 findings，並重播每個 finding 的修復 prompt。

## Working State

完成後可用：

```bash
reviewstuff findings
reviewstuff prompts --finding <id>
```

## Scope

包含：

- `reviewstuff findings`
- `reviewstuff prompts`
- status/severity filters
- JSON output
- per-finding prompt file

不包含：

- 自動修復
- agent streaming protocol

## Implementation Steps

1. 從 latest session 讀 findings。
2. 實作 filters：status、severity、session id。
3. prompt 從 stored finding + current file context 產生。
4. `prompts` 不呼叫 AI engine。
5. prompt 也存回 session 方便重用。

## Verification

```bash
AI_REVIEW_FAKE_ENGINE=1 ./dist/reviewstuff review --staged --json
./dist/reviewstuff findings --json
./dist/reviewstuff prompts --finding <id>
```

## Acceptance Criteria

- findings/prompts 不呼叫模型。
- JSON output 穩定。
- missing session 有清楚錯誤。

## Learning Focus

- 從 persisted session 建立 read-only commands。
- 將 prompt generation 做成可重播、可測試的純流程。

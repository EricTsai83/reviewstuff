# 011 - Findings And Prompt Replay

## Goal

讓使用者不重跑模型也能查看 findings，並重播每個 finding 的修復 prompt。

## Working State

完成後可用：

```bash
reviewstuff review findings
reviewstuff review prompts --finding <id>
```

## Scope

包含：

- `reviewstuff review findings`
- `reviewstuff review prompts`
- status/severity filters
- JSON output
- deterministic per-finding prompt generation

不包含：

- 自動修復
- agent streaming protocol

## Implementation Steps

1. 從 latest session 讀 findings。
2. 實作 filters：status、severity、session id。
3. 實作 `review findings`；尚未發布過舊 command，因此不建立重複 top-level alias。
4. prompt 從 stored finding + stored normalized diff 產生，確保工作樹後續改動不會偷偷改變
   replay 內容；不假設 010 保存完整 source snapshot。若使用者明確要求 current context，先驗
   preimage hash，輸出標示為 regenerated，hash drift 則拒絕並要求重新 review。
5. 實作 `review prompts --finding <id>` 作為 prompt replay subcommand；它不進入一般
   `review` provider flow，也不建立會改變主 command 語意的 mode flag。
6. prompt replay 不呼叫 AI engine。
7. 這一階段不持久化完整 prompt，只保存 prompt schema version/hash 等非敏感 metadata；
   prompt/request snapshot 必須等 029 的 redaction、retention 與 cleanup policy 完成後才能 opt-in 保存。

## Verification

```bash
./dist/reviewstuff review --engine fake --json
./dist/reviewstuff review findings --json
./dist/reviewstuff review prompts --finding <id>
```

## Acceptance Criteria

- findings/prompts 不呼叫模型。
- JSON output 穩定。
- missing session 有清楚錯誤。
- 相同 session/finding/schema version 產生相同 replay prompt；預設不把完整 prompt 寫回 disk。
- findings/prompts 只有 `review` namespace 下的 canonical command，不維護尚未發布的重複 aliases。

## Learning Focus

- 從 persisted session 建立 read-only commands。
- 將 prompt generation 做成可重播、可測試的純流程。

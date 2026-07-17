# 029 - Security Privacy And Data Policy

## Goal

明確處理本機 codebase 傳給 AI provider 的資料風險，讓使用者能安全地採用。

## Working State

完成後 CLI 有可設定的 privacy policy、secret redaction、資料保留說明與安全預設。

## Scope

包含：

- privacy modes：`local-only`、`cloud-allowed`
- provider allowlist
- secret detection/redaction before provider request
- `.reviewstuffignore`
- prompt/request preview mode
- session redaction policy
- session retention and cleanup command
- no telemetry by default
- SECURITY.md / privacy docs

不包含：

- enterprise policy server
- remote audit log upload
- guaranteed secret detection
- encrypted local storage

## Implementation Steps

1. 定義 privacy config schema。
   fresh config 的安全預設為 `local-only`；使用 cloud provider 需要明確 config/flag，並記錄
   effective provider/transport/policy。
2. 實作 `.reviewstuffignore`，使用明確 documented pattern semantics；它只能再排除資料，
   不能重新納入 023 的 binary/media hard exclusion 或 repo-root 外路徑。
3. 在 request builder 前加入 redaction pipeline，涵蓋 diff/context、path metadata、analyzer
   output、prompt replay 與 provider debug fields；每個 redaction 產生 stable reason/count，
   但 log 不得回顯 secret 原文。
4. `local-only` mode 禁止 cloud provider。
5. prompt/request snapshot 預設不保存；只有 opt-in 且通過相同 redaction policy 才能落 disk。
6. 實作 `reviewstuff sessions clean` 或等價 cleanup flow，依 retention policy 清理本機
   sessions/prompts/request snapshots。預設先 dry-run；實際刪除需明確確認/flag，拒絕 symlink
   traversal，並逐項回報刪除範圍。
7. `--dry-run-request` 在 redaction 後輸出 preview，不呼叫 provider、不建立 session/snapshot，
   machine-readable mode 仍維持 stdout contract。
8. doctor 顯示 privacy/provider/retention 狀態。
9. 文件清楚說明哪些資料會送給 provider、哪些資料會留在本機、如何清理，以及 secret
   detection 只能降低風險、不能保證找出所有秘密。

## Verification

```bash
bun run test
./dist/reviewstuff review --engine fake --privacy local-only --json
./dist/reviewstuff review --engine fake --dry-run-request --json
./dist/reviewstuff sessions clean --dry-run
```

## Acceptance Criteria

- cloud provider 在 `local-only` mode 被拒絕。
- obvious secrets 在 provider request 前被 redacted。
- 使用者可以預覽將送出的 request。
- docs 說明資料流和限制。
- 使用者可以清理本機保存的 sessions/prompts/request snapshots。
- redaction pipeline 套用在 provider request、session metadata、prompt replay 三個路徑。
- request preview 不呼叫 provider也不持久化內容；cleanup dry-run、confirm、symlink escape 與
  interrupted cleanup 有 deterministic tests。

## Learning Focus

- AI code review 的資料治理。
- security default 與 user consent。

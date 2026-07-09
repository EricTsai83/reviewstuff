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
2. 實作 `.reviewstuffignore`。
3. 在 request builder 前加入 redaction pipeline。
4. `local-only` mode 禁止 cloud provider。
5. 實作 `reviewstuff sessions clean` 或等價 cleanup flow，依 retention policy 清理本機 sessions/prompts/request snapshots。
6. doctor 顯示 privacy/provider/retention 狀態。
7. 文件清楚說明哪些資料會送給 provider、哪些資料會留在本機、如何清理。

## Verification

```bash
bun run test
./dist/reviewstuff review --privacy local-only --json
./dist/reviewstuff review --dry-run-request --json
./dist/reviewstuff sessions clean --dry-run
```

## Acceptance Criteria

- cloud provider 在 `local-only` mode 被拒絕。
- obvious secrets 在 provider request 前被 redacted。
- 使用者可以預覽將送出的 request。
- docs 說明資料流和限制。
- 使用者可以清理本機保存的 sessions/prompts/request snapshots。
- redaction pipeline 套用在 provider request、session metadata、prompt replay 三個路徑。

## Learning Focus

- AI code review 的資料治理。
- security default 與 user consent。

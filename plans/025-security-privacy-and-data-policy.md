# 025 - Security Privacy And Data Policy

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
- no telemetry by default
- SECURITY.md / privacy docs

不包含：

- enterprise policy server
- remote audit log upload
- guaranteed secret detection

## Implementation Steps

1. 定義 privacy config schema。
2. 實作 `.reviewstuffignore`。
3. 在 request builder 前加入 redaction pipeline。
4. `local-only` mode 禁止 cloud provider。
5. doctor 顯示 privacy/provider 狀態。
6. 文件清楚說明哪些資料會送給 provider。

## Verification

```bash
bun run test
./dist/reviewstuff review --privacy local-only --json
./dist/reviewstuff review --dry-run-request --json
```

## Acceptance Criteria

- cloud provider 在 `local-only` mode 被拒絕。
- obvious secrets 在 provider request 前被 redacted。
- 使用者可以預覽將送出的 request。
- docs 說明資料流和限制。

## Learning Focus

- AI code review 的資料治理。
- security default 與 user consent。

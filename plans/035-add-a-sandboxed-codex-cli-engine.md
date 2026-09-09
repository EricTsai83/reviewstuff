# 035 — Add a sandboxed Codex CLI engine

[← Plan index](./README.md)

**Depends on:** 034。 **Learning:** subprocess provider as a constrained adapter whose data still leaves the machine。

**Privacy 決策：codex-cli 的 transport 是 `cloud`。** Codex CLI 是本機 subprocess，但它把 prompt 送到
OpenAI；repo 資料一樣離開本機。`decideReviewPrivacy`（`src/use-cases/run-review.ts`）只看 transport，
若登記為 `local`，`privacy: local-only` 的使用者會在不知情下把 diff 送上雲端。因此 registry entry
的 `transport` 必須是 `cloud`，`local-only` 下選 codex-cli 要得到與 openai 相同的
`ReviewCloudPrivacyError`。本 repo 的所有文字（036、045、046）都稱它為「Codex CLI engine」，不稱
「local engine」。

**Working state:** `reviewstuff review --engine codex-cli --model <id> --privacy cloud-allowed --json` 將
normalized request 交給 non-interactive Codex，並得到 schema-constrained findings。

**In:** executable/version discovery、`codex exec --ephemeral --sandbox read-only --output-schema` integration、controlled
temp cwd（讓 Codex 看不到 repo）、timeout/output cap、JSONL/final output parsing、registry entry 標記
`transport: "cloud"`、任何新增 config 欄位（例如 codex executable path）同步更新 048 provenance。
**Out:** `codex review` repo discovery、session resume、write sandbox、installing/authenticating Codex、retry（036）。

**Steps:** 實作時先核對 current Codex CLI 文件的 non-interactive mode 與 flag 名稱（plan 撰寫時的連結
可能已失效，以 `codex exec --help` 實測為準）；capability probe current help/version；透過
CommandRunner 以 argv 執行；避免載入 user config/rules when supported；adapter 只傳 normalized request，
不讓 Codex 自行選 Git scope；fixture CLI tests。

**Accept:** use-case/contract 無 CommandRunner；repo files 不由 adapter 直接讀；unsupported flag/version 有
remediation；no shell；`local-only` 下選 codex-cli 被 privacy check 拒絕且有 e2e；report 的 privacy decision
記錄 `transport: "cloud"`。

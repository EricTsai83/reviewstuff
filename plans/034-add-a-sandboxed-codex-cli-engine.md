# 034 — Add a sandboxed Codex CLI engine

[← Plan index](./README.md)

**Depends on:** 033。 **Learning:** local subprocess provider as a constrained adapter。

**Working state:** `reviewstuff review --engine codex-cli --model <id> --json` 將 normalized request交給 non-interactive
Codex，並得到 schema-constrained findings。

**In:** executable/version discovery、`codex exec --ephemeral --sandbox read-only --output-schema` integration、controlled
temp cwd、timeout/output cap、JSONL/final output parsing。 **Out:** `codex review` repo discovery、session resume、write sandbox、
installing/authenticating Codex。

**Steps:** capability probe current help/version；透過 CommandRunner以 argv執行；避免載入 user config/rules when supported；
adapter只傳 normalized request，不讓 Codex自行選 Git scope；fixture CLI tests。

**Accept:** use-case/contract無 CommandRunner；repo files不由 adapter直接讀；unsupported flag/version有 remediation；no shell；
follow current [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)。


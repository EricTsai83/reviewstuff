# 046 — Document installation and first review

[← Plan index](./README.md)

**Depends on:** 045。 **Learning:** executable onboarding documentation。

**Working state:** 新使用者可從 README選 Homebrew/npm/local安裝、設定 OpenAI或Codex CLI、preview request、完成 first review與
agent-mode example。

**In:** quickstart、provider setup、configuration reference、install/update guidance、troubleshooting、NDJSON recipe、docs smoke harness。
**Out:** marketing site、unsupported platform instructions、非 v1 commands。

**Steps:** 以實際 `--help`與 schema生成/核對 examples；所有無 credentials commands進 smoke；live/provider/Apple命令標 prerequisite、
成本與副作用；列出 darwin-arm64 support boundary。

**Accept:** docs不提不存在 flags；agent example只解析 NDJSON；Homebrew/npm指向相同 signed version；fresh-user fixture可照 quickstart
完成 fake/no-change smoke。


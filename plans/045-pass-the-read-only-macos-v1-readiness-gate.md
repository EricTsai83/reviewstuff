# 045 — Pass the read-only macOS v1 readiness gate

[← Plan index](./README.md)

**Depends on:** 044。 **Learning:** release criteria without adding features。

**Working state:** 可正式發布「macOS arm64、read-only、OpenAI cloud或Codex CLI local」v1；其他能力明確列為 unsupported。

**In:** full deterministic suite、binary/release/install smokes、opt-in provider smokes、privacy/no-change/error/interrupt NDJSON matrix、schema
compatibility、threat-model audit、release notes/known issues。 **Out:** new feature、large refactor、waiving security/data-loss blockers。

**Steps:** 建 checklist與 evidence links；驗 tag/source/provenance/signed bytes/manifest/Homebrew/npm一致；current+previous fixtures；live cloud
smoke在 gated budget environment；未過項目回到 owning plan修正。

**Accept:** no known data-loss/default secret leakage/authenticity blocker；install channels指向同一 final bytes；agent success/skip/error contracts
stable；只有 non-critical limitation可帶 owner/reason/expiry列 known issue；production tag不宣稱支援非 v1 功能。

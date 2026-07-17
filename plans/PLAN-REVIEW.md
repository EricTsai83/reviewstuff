# Unfinished plan review — 2026-07-18

本文件記錄舊未完成 plan 的處理結果。新的 executable source of truth 是
[ROADMAP.md](./ROADMAP.md)；此文件只提供 audit trail，不建立第二套順序。

## 主要 findings

1. **Status drift:** 005 已有完整 Git/deterministic pipeline，006 甚至已完成，但 005 仍是 TODO。
   若照表執行會重做現有功能，因此改成一次性的 `VERIFY` closure。
2. **Safety ordering 倒置:** cloud provider 早於 explicit privacy consent、redaction、request preview；大型
   request budget又排到 036。現在 budget與 data policy都在第一次 cloud call之前。
3. **Persistence contract 太早綁定不穩定資料:** 舊 010 在 scope、coverage、privacy與 normalized request
   未穩定前保存多個檔案。現在先穩定 read-only output，再以單一 versioned session file落地。
4. **Release bytes identity 不清楚:** 舊順序先 Homebrew/npm，之後才 signing/notarization，容易讓 channel
   checksum指向 unsigned bytes。現在先建立 canonical artifact、簽署、重新 package，再接 install channels。
5. **Optional breadth 阻塞 production:** fix apply、deep agent、五種 analyzers、多平台與 self-update被當成
   production blocker。v1 改成清楚支援 darwin-arm64 read-only review；高風險/廣度功能需 evidence 才升格。
6. **Plan scope 過大:** 舊 022 同時包含 repo root、五種 scope flags、default base、type composition、fast mode；
   舊 029 同時包含 privacy mode、ignore、redaction、preview、retention/cleanup與 docs。這些已按單一概念拆分。

## 舊 plan migration

| Old | Review result | New destination |
| ---: | --- | --- |
| 005 | Implementation exists; closure evidence missing | 005 `VERIFY` |
| 007 | Schema migration與service extraction耦合 | 007 contract；008 fake engine |
| 008 | Request、privacy、adapter、wiring混在一起 | 009、013–017 |
| 009 | 兩個不同 provider transports同 plan | Codex → 034；Anthropic → backlog |
| 010 | Schema、filesystem transaction、use-case wiring同 plan | 027–029 |
| 011 | Findings query與prompt replay是兩個 user flows | 030、031 |
| 012 | 非 v1 correctness/release blocker | local stats → backlog |
| 013 | 新 model capability + workspace + gates | fix workflow → backlog |
| 014 | Review與fix agent protocol一起 | read-only review events → 032；fix events隨 fix backlog |
| 015 | 可保留，但只聚合已存在 capabilities | 033 |
| 016 | Extension point沒有已驗證需求 | language detection → backlog |
| 017 | External tool execution是獨立 product surface | analyzers → backlog，逐工具 promotion |
| 018 | Tool loop在 single-shot review前過早 | deep review → backlog |
| 019 | 可保留，縮成單一 supported target | 038 |
| 020 | 不應先消費 unsigned production bytes | 041（在 signing/release之後） |
| 021 | install detection混入第一個 package | package → 042；cross-channel provenance隨各 channel貢獻 |
| 022 | 九種 scope/policy概念 | 018–023、026 |
| 023 | Filter、ignore、skip、rename policy混合 | 023–025 |
| 024 | Multi-file data mutation需要先驗證需求 | fix apply → backlog |
| 025 | Ruff、mypy、pytest三種不同 semantics | analyzers/gates → backlog |
| 026 | Go、Rust、Semgrep與test gates過多 | analyzers/gates → backlog |
| 027 | Analyzer、gate、skill trust三種風險面 | deep tools/skills → backlog |
| 028 | Retry、budget、cost、fallback混合 | request budget → 010–012；retry → 035；metadata → 036 |
| 029 | 六個主要 security/data lifecycle概念 | cloud gate/redaction/preview → 013–015；ignore → 024；docs → 043；cleanup → backlog |
| 030 | 合理的小型 automation slice | 037 |
| 031 | Signing前產生多平台 release擴大風險 | single-target draft release → 040；multi-platform → backlog |
| 032 | 合理但必須先決定 final bytes identity | 039 |
| 033 | Package matrix、signed manifest、network update同 plan | first package → 042；multi-platform/update → backlog |
| 034 | Updater直接修改 binary，尚無 adoption evidence | self-update → backlog |
| 035 | Security、providers、install、onboarding文件過廣 | 043、044 |
| 036 | 正確問題但太晚，且同時改 Git/review/output | 010–012，移到 first cloud call之前 |
| 037 | Gate內容被 optional breadth綁架 | 045，僅 audit supported v1 contract |

## 新主線的 stop points

- 完成 017：可以安全 cloud dogfood，不必先做 storage/release。
- 完成 026：常用 repository scope與可觀察 input policy穩定。
- 完成 036：可以作為 durable local automation beta。
- 完成 045：只對文件中列出的 darwin-arm64 read-only contract標示 production-ready。

任何 stop point 都是 working product；後續 plan只增加能力，不修復前序 plan留下的半成品。

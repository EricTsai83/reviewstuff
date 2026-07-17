# Discovery backlog

以下項目來自舊 007–037 草案，但不在 read-only macOS v1 的 critical path。它們目前是 product
discovery topics，不是可直接 implement 的 plan。這可避免用尚未驗證的需求把主線切成大量
互相耦合的工作。

要升格成 numbered plan，必須先寫出：使用者問題、最小 working state、單一學習主題、前置
contract、out-of-scope、deterministic verification，以及為什麼不能用更小的現有能力解決。

| Topic | 為何延後 | Promotion gate |
| --- | --- | --- |
| Anthropic provider | v1 已用 OpenAI cloud + Codex local 驗證 provider contract | 使用者確實需要第二個 cloud vendor，且 registry/error taxonomy 已穩定 |
| Local stats/cache | 不影響 review 正確性或發布 | sessions 的實際使用量足以回答要聚合哪些 metrics |
| Fix candidate / dry-run | 新增另一套 model capability、workspace 與 gate contract | read-only findings 已穩定，且有明確人工修復工作流痛點 |
| Multi-file fix apply | 直接修改使用者資料，需要 journal/recovery/threat model | dry-run 被驗證有價值，且單檔 replacement prototype 通過 failure injection |
| Language adapters/analyzers | 每個 tool 都有 discovery、parser、cache、write-isolation 成本 | dogfood 顯示 LLM-only review 的具體缺口；一次只升格一個 analyzer |
| Deep review agent | tool loop、budget、prompt injection 與 event protocol 風險高 | single-shot review coverage 不足的 session evidence，且 readonly tool threat model 完成 |
| Skills / repo-local instructions | untrusted repo content 可擴張 prompt-injection surface | readonly agent 已穩定，並有 explicit trust UX 設計 |
| Multi-platform packages | v1 先明確只支援 macOS arm64 | 有對應 runner、binary smoke 與使用者需求；每個 OS/arch 單獨升格 |
| Update check | 需要 signed manifest、install provenance 與 network policy | 第一個正式 release 存在，且 artifact origin/key-rotation policy 已決定 |
| Direct self-update | replacement/rollback 風險高，package managers 已有更新路徑 | direct-tarball installs 有實際採用，且 signed update check 已穩定 |
| Windows support | packaging、signing、path/process 語意是獨立產品面 | 有 Windows runner、owner 與明確支援承諾 |

## 保留的設計約束

- Analyzer 只產生 diagnostics；test/build 是 explicit gate，不因語言偵測就在使用者工作樹執行。
- Agent/use-case 不取得 `CommandRunner`，也不提供任意 shell；tools 只能呼叫 typed allowlisted
  semantic operations。
- Repo-local skill 必須 explicit trust opt-in，且不能擴張 tool allowlist、path boundary 或 budget。
- Fix dry-run 必須 materialize exact reviewed preimage；`HEAD` 不能替代 staged/unstaged/untracked
  session state。
- Multi-file apply 必須有 fsynced journal、rollback 與 crash recovery；各檔 atomic rename 不等於
  整個 transaction atomic。
- Self-update 必須驗 signed manifest、固定 HTTPS origin、platform identity、archive containment、
  checksum 與 atomic replacement；checksum 本身不提供 authenticity。

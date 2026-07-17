# ReviewStuff implementation plans

這裡只維護一條可依序執行的主線。001–006 的歷史 plan 保留為已完成實作紀錄；007 之後的
canonical plan 全部集中在 [ROADMAP.md](./ROADMAP.md)，避免跨檔案的順序、依賴與 scope 漂移。
不在 v1 critical path 的構想放在 [BACKLOG.md](./BACKLOG.md)，尚未通過 promotion gate 前不算
「未完成 plan」，也不應提前實作。

舊未完成 plan如何被拆分、延後或取代，記錄在 [PLAN-REVIEW.md](./PLAN-REVIEW.md)。

## 這次重整的結論

- 現有 005 功能已存在且 typecheck、106 個直接 Bun tests 通過；因本次未獲授權重跑 build，
  狀態是 `VERIFY`，先完成 closure verification 才能標記 DONE。
- 007–037 舊草案把 provider、storage、fix、deep agent、analyzer、distribution、update 混在同一條
  production path；它們已由新的小型 v1 slices 取代。
- v1 定義為「安全、可觀察、可發布的 read-only local code review CLI」。Fix apply、deep agent、
  多語言 analyzer、Anthropic、多平台與 self-update 都不是 v1 blocker。
- 主線每一個 plan 只引入一個主要概念，且只依賴編號更小、已完成的 plan。

## 執行規則

每次只 implement 一個 plan。開始前先讀該 plan 的 `Depends on`、`Out of scope` 與 acceptance
criteria；完成後才更新下方狀態。不要順手建立後續 plan 的 schema、service skeleton、flag 或空目錄。

一個 plan 必須同時符合：

- 能在 1–2 個 focused sessions 完成。
- 有一個主要學習主題與一個可觀察的 working state。
- 產生可單獨 review、可回退、可測試的 change set。
- 預設用 fake、fixture 或 local temporary repo 驗證；付費 API、Apple identity、release permission
  只能是 opt-in smoke prerequisite。
- 完成後 binary 仍可執行，且不需要後續 plan 才能修復當前 plan 引入的不完整狀態。
- 若實作觸及三個以上 semantic service boundaries，先拆 plan，不以「只是 wiring」為理由合併。

「獨立」在這裡指 change set 自足、驗收不借用未來功能；不是指完全沒有前置依賴。每個 plan
可以依賴前序已完成 contract，但不可依賴後續 plan 才能通過測試或讓 CLI 恢復 working state。

## 架構約束

- `commands/` 只解析 flags、呼叫 use-case、render typed result。
- `use-cases/` 編排 semantic services，不直接使用 filesystem、network、provider SDK 或 subprocess。
- `domain/`、`review/` 放 versioned schema 與 pure policy。
- `platform/` 集中低階 filesystem、command、clock、environment、network 能力。
- `git/`、`engines/`、`storage/` 等 capability module 擁有自己的 contract 與 canonical implementation。
- 外部 command 一律經 `CommandRunner`，使用 argv、timeout、combined output limit 與 cancellation cleanup；
  不使用 shell string、`child_process` 或 feature code 內的 `Bun.spawn`。
- Public/persisted schema 必須 versioned；破壞性變更新增版本與 migration/refusal fixture。
- Machine-readable stdout 不混入 diagnostics。`--json` 是單一 document；`--agent` 是 NDJSON。
- Repo path 先 canonicalize，再以選定 repo root 做 containment；拒絕 symlink/traversal escape。
- 多檔案替換不能宣稱 filesystem-atomic；需要 journal 與 recovery，但該能力不在 v1 主線。

## 技術與驗證基線

- Runtime/package manager/test/build target：Bun。
- Application runtime：Effect；platform integration 優先使用 `@effect/platform` 與
  `@effect/platform-bun`。
- TypeScript strict mode；不得使用 `any`，除非 plan 明確說明無法避免的 interop boundary。
- 一般驗收至少執行 `bun run typecheck` 與 `bun test`。`bun run test` 目前包含 build；只有獲得
  build 授權時才執行。需要 compiled binary 的 plan 必須另列 binary smoke。
- 不把 credentials、provider payload、未 redacted session 或使用者 source 上傳為 CI artifact。

## Status

| Status | Order | Plan | Working state |
| --- | ---: | --- | --- |
| [x] DONE | 001 | [Project Bootstrap And Bun CLI](./001-project-bootstrap-and-bun-cli.md) | 最小 standalone CLI |
| [x] DONE | 002 | [Binary Test Harness](./002-binary-test-harness.md) | compiled binary e2e |
| [x] DONE | 003 | [Local CLI Workflow](./003-local-cli-workflow.md) | 本機 binary workflow |
| [x] DONE | 004 | [Repository Structure Boundaries](./004-repository-structure-boundaries.md) | module boundary 固定 |
| [!] VERIFY | 005 | [Git Diff Review MVP](./005-git-diff-review-mvp.md) | 已實作；待 closure build/smoke |
| [x] DONE | 006 | [Config Profiles](./006-config-profiles-and-prompts.md) | versioned config/profile |
| [ ] TODO | 007–045 | [Atomic v1 roadmap](./ROADMAP.md) | 依序完成 read-only production v1 |

狀態只能由 `TODO` → `IN PROGRESS` → `DONE`。005 的 `VERIFY` 是本次 baseline audit 的一次性狀態；
完成其 closure commands 後改為 `DONE`，之後從 007 開始維持嚴格順序。

## Milestones

| Milestone | Plans | Exit state |
| --- | --- | --- |
| Baseline closure | 005 | 現有 deterministic review pipeline 正式關閉 |
| Safe cloud dogfood | 007–017 | 有 budget、privacy、redaction、preview 的 OpenAI review |
| Real repository UX | 018–026 | repo root、commit/branch scopes、filters、skip policy、fast mode |
| Durable automation beta | 027–036 | sessions、queries、NDJSON、doctor、Codex CLI、provider reliability |
| Supported macOS v1 | 037–045 | CI、signed artifact、Homebrew/npm、docs、readiness gate |

## Plan completion checklist

- 只改該 plan 的 scope，沒有新增後續功能 skeleton。
- 所有 acceptance criteria 有對應測試或明確 opt-in smoke evidence。
- `bun run typecheck` 通過。
- `bun test` 通過；若該命令因 repository script 觸發 build，先取得 build 授權。
- 需要 compiled artifact 的 plan 另跑它列出的 smoke commands。
- Public/persisted schema 有 current 與 previous-version fixture。
- 新增的 error 能在 human 與 machine-readable boundary 被穩定處理。
- 更新本表狀態，而且下一個 plan 不需要先修正本 plan 的遺留問題。

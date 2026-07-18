# ReviewStuff implementation plans

這裡只維護一條可依序執行的主線。每個編號各有一份 canonical plan，本文件只負責共通規則、
執行順序、狀態與 milestone，避免單一 roadmap 隨主線增長而必須整份載入。

## 執行規則

每次只 implement 一個 plan。開始前只需讀本文件的共通規則與當前 plan；只有直接前置 contract
不清楚時，才讀該 plan 的 `Depends on` 所指檔案，不需載入其他未完成 plan。先確認當前 plan 的
`Out of scope` 與 acceptance criteria，完成後才更新下方狀態。不要順手建立後續 plan 的 schema、
service skeleton、flag 或空目錄。

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

## 技術與驗證基線

- Runtime/package manager/test/build target：Bun。
- Application runtime：Effect；platform integration 優先使用 `@effect/platform` 與
  `@effect/platform-bun`。
- TypeScript strict mode；不得使用 `any`，除非 plan 明確說明無法避免的 interop boundary。
- 一般驗收至少執行 `bun run typecheck` 與 `bun test`。`bun run test` 目前包含 build；只有獲得
  build 授權時才執行。需要 compiled binary 的 plan 必須另列 binary smoke。
- 不把 credentials、provider payload、未 redacted session 或使用者 source 上傳為 CI artifact。

## Status and plan index

| Status | Order | Plan | Outcome / milestone |
| --- | ---: | --- | --- |
| [x] DONE | 001 | [Project Bootstrap And Bun CLI](./001-project-bootstrap-and-bun-cli.md) | 最小 standalone CLI |
| [x] DONE | 002 | [Binary Test Harness](./002-binary-test-harness.md) | compiled binary e2e |
| [x] DONE | 003 | [Local CLI Workflow](./003-local-cli-workflow.md) | 本機 binary workflow |
| [x] DONE | 004 | [Repository Structure Boundaries](./004-repository-structure-boundaries.md) | module boundary 固定 |
| [x] DONE | 005 | [Git Diff Review MVP](./005-git-diff-review-mvp.md) | deterministic Git diff review |
| [x] DONE | 006 | [Config Profiles](./006-config-profiles-and-prompts.md) | versioned config/profile |
| [x] DONE | 007 | [Normalize Review Contracts](./007-normalize-review-contracts.md) | Safe cloud dogfood |
| [x] DONE | 008 | [Extract The Fake Review Engine](./008-extract-the-fake-review-engine.md) | Safe cloud dogfood |
| [x] DONE | 009 | [Build A Pure Review Request](./009-build-a-pure-review-request.md) | Safe cloud dogfood |
| [x] DONE | 010 | [Preserve Normalized File And Hunk Metadata](./010-preserve-normalized-file-and-hunk-metadata.md) | Safe cloud dogfood |
| [x] DONE | 011 | [Select Complete Hunks Within A Request Budget](./011-select-complete-hunks-within-a-request-budget.md) | Safe cloud dogfood |
| [ ] TODO | 012 | [Integrate Budgeted Coverage Into Review Output](./012-integrate-budgeted-coverage-into-review-output.md) | Safe cloud dogfood |
| [ ] TODO | 013 | [Enforce An Explicit Cloud Privacy Mode](./013-enforce-an-explicit-cloud-privacy-mode.md) | Safe cloud dogfood |
| [ ] TODO | 014 | [Redact Obvious Secrets Before Engine Input](./014-redact-obvious-secrets-before-engine-input.md) | Safe cloud dogfood |
| [ ] TODO | 015 | [Preview The Exact Outbound Request](./015-preview-the-exact-outbound-request.md) | Safe cloud dogfood |
| [ ] TODO | 016 | [Implement The OpenAI Responses Adapter](./016-implement-the-openai-responses-adapter.md) | Safe cloud dogfood |
| [ ] TODO | 017 | [Select And Run The OpenAI Engine](./017-select-and-run-the-openai-engine.md) | Safe cloud dogfood |
| [ ] TODO | 018 | [Select A Repository With `--dir`](./018-select-a-repository-with-dir.md) | Real repository UX |
| [ ] TODO | 019 | [Review An Exact Committed Range](./019-review-an-exact-committed-range.md) | Real repository UX |
| [ ] TODO | 020 | [Review A Branch Using Merge-base Semantics](./020-review-a-branch-using-merge-base-semantics.md) | Real repository UX |
| [ ] TODO | 021 | [Compose Committed And Uncommitted Scopes](./021-compose-committed-and-uncommitted-scopes.md) | Real repository UX |
| [ ] TODO | 022 | [Infer A Default Branch Scope Conservatively](./022-infer-a-default-branch-scope-conservatively.md) | Real repository UX |
| [ ] TODO | 023 | [Filter Review Paths Explicitly](./023-filter-review-paths-explicitly.md) | Real repository UX |
| [ ] TODO | 024 | [Apply `.reviewstuffignore` As Exclusion-only Policy](./024-apply-reviewstuffignore-as-exclusion-only-policy.md) | Real repository UX |
| [ ] TODO | 025 | [Centralize File Skip Policy](./025-centralize-file-skip-policy.md) | Real repository UX |
| [ ] TODO | 026 | [Add One Fast Review Policy](./026-add-one-fast-review-policy.md) | Real repository UX |
| [ ] TODO | 027 | [Define The Persisted Review Session Schema](./027-define-the-persisted-review-session-schema.md) | Durable automation beta |
| [ ] TODO | 028 | [Store And Load Sessions Atomically](./028-store-and-load-sessions-atomically.md) | Durable automation beta |
| [ ] TODO | 029 | [Persist Successful Review Sessions](./029-persist-successful-review-sessions.md) | Durable automation beta |
| [ ] TODO | 030 | [Query Stored Findings](./030-query-stored-findings.md) | Durable automation beta |
| [ ] TODO | 031 | [Replay A Deterministic Repair Prompt](./031-replay-a-deterministic-repair-prompt.md) | Durable automation beta |
| [ ] TODO | 032 | [Stream Review Events As NDJSON](./032-stream-review-events-as-ndjson.md) | Durable automation beta |
| [ ] TODO | 033 | [Aggregate A Minimal Doctor Report](./033-aggregate-a-minimal-doctor-report.md) | Durable automation beta |
| [ ] TODO | 034 | [Add A Sandboxed Codex CLI Engine](./034-add-a-sandboxed-codex-cli-engine.md) | Durable automation beta |
| [ ] TODO | 035 | [Retry Only Safe Provider Failures](./035-retry-only-safe-provider-failures.md) | Durable automation beta |
| [ ] TODO | 036 | [Persist Provider Run Metadata](./036-persist-provider-run-metadata.md) | Durable automation beta |
| [ ] TODO | 037 | [Establish The Pull-request CI Gate](./037-establish-the-pull-request-ci-gate.md) | Supported macOS v1 |
| [ ] TODO | 038 | [Package One Release Artifact Deterministically](./038-package-one-release-artifact-deterministically.md) | Supported macOS v1 |
| [ ] TODO | 039 | [Sign And Notarize The macOS Executable](./039-sign-and-notarize-the-macos-executable.md) | Supported macOS v1 |
| [ ] TODO | 040 | [Automate A Draft Signed Release](./040-automate-a-draft-signed-release.md) | Supported macOS v1 |
| [ ] TODO | 041 | [Install The Signed Artifact With Homebrew](./041-install-the-signed-artifact-with-homebrew.md) | Supported macOS v1 |
| [ ] TODO | 042 | [Install The Signed Artifact From One npm Platform Package](./042-install-the-signed-artifact-from-one-npm-platform-package.md) | Supported macOS v1 |
| [ ] TODO | 043 | [Document The Privacy And Security Contract](./043-document-the-privacy-and-security-contract.md) | Supported macOS v1 |
| [ ] TODO | 044 | [Document Installation And First Review](./044-document-installation-and-first-review.md) | Supported macOS v1 |
| [ ] TODO | 045 | [Pass The Read-only macOS v1 Readiness Gate](./045-pass-the-read-only-macos-v1-readiness-gate.md) | Supported macOS v1 |

狀態只能由 `TODO` → `IN PROGRESS` → `DONE`；從 007 開始維持嚴格順序。

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

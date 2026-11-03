# ReviewStuff implementation plans

這裡只維護尚未完成、可依序執行的一條主線。每個編號各有一份 canonical plan，本文件只負責
共通規則、執行順序、狀態與剩餘 milestone。

## 設計依據與 plan 生命週期

- 所有設計都以當下 codebase、實際需求與測試為依據，選擇當下最合適、簡單的方案。
  舊 plan 的設計決策不構成約束，不為延續過去計畫而保留已不合適的 abstraction 或 contract。
- 未完成 plan 是可修訂的工作假設。開始實作前先核對現有程式、測試與整合邊界；若與 plan
  不符或已有更合適的方案，先更新該 plan 的設計、範圍、驗收條件及相關依賴，再實作。
- 本目錄只保留 `TODO` 與 `IN PROGRESS` 的 plan。完成驗收後，在同一個 change set 刪除
  該 plan 檔案與本文件的索引列，不封存、不建立已完成清單，也不保留歷史 plan 作為設計依據。
- 刪除時同步清理其他 plan、milestone 與文件的引用。已實作的前置能力改指向現有程式、測試
  或仍適用的 reference 文件；`Depends on` 只列尚未完成的前置 plan。
- 需要長期說明的現行行為或使用方式，更新到適當的 `docs/reference`、`docs/system-design`
  或使用文件；只記錄當前實作，不搬移舊 plan 或保留過時設計。文件與實作不符時先查證 codebase，
  再修正文案或計畫。
- 保留未完成 plan 的原編號，不因刪除而重新編號；執行順序以本文件的表格列序為準。

## 執行規則

每次只 implement 一個 plan。開始前讀本文件、當前 plan 與直接相關的現有程式及測試；
`Depends on` 用來確認未完成前置工作，不需載入其他無關 plan。先核對當前 plan 的設計、
`Out of scope` 與 acceptance criteria，開始時標為 `IN PROGRESS`，完成驗收後依生命週期規則刪除。
不要順手建立後續 plan 的 schema、
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
可以依賴 codebase 中已存在且經確認的 contract，但不可依賴後續 plan 才能通過測試或讓 CLI 恢復 working state。

「不建立後續 plan 的 schema」有一個刻意例外：當同一個 machine-owned contract 會被連續數個 plan
各改一次時，第一個 plan 必須一次定義完整的 contract（含全部 variants），後續 plan 只填入行為。
目前適用的是 019 的 scope contract（涵蓋 019–022 與 `ReviewFileSource`）。這是為了避免同一個
report schema 在一個 milestone 內被 bump 四次，並不允許建立 flag、service skeleton 或空目錄。

## 技術與驗證基線

- Runtime/package manager/test/build target：Bun。
- Application runtime：Effect；platform integration 優先使用 `@effect/platform` 與
  `@effect/platform-bun`。
- TypeScript strict mode；不得使用 `any`，除非 plan 明確說明無法避免的 interop boundary。
- 一般驗收至少執行 `bun run typecheck` 與 `bun test`。`bun run test` 目前包含 build；只有獲得
  build 授權時才執行。需要 compiled binary 的 plan 必須另列 binary smoke。
- 不把 credentials、provider payload、未 redacted session 或使用者 source 上傳為 CI artifact。
- Machine-owned schema（report、request、coverage、selection）的版本政策分兩個階段：
  - **Pre-persistence（029 之前）：** 沒有任何 report 被寫入 disk 或由 tagged release 發布，因此
    schema 變更時仍 bump 版本號，但只維護 current fixture 與 decoder，不新增 migration。027 負責
    刪除現有 V2–V6 migration 與 fixtures，讓 `decodeReviewReport` 只接受 current version。
  - **Persisted（029 起）：** 任何被 session 持久化或 tagged release 發布過的版本都要保留
    migration、previous-version fixture 與 `assumed-by-migration` 類型的證據標記。
  - 為了讓 bump 次數可控，scope（019）、coverage 語意（025）、provider metadata（037）各只允許
    一次 report bump；exit-code gate（032）不得進入 report schema。

## Status and plan index

| Status | Order | Plan | Outcome / milestone |
| --- | ---: | --- | --- |
| [ ] TODO | 053 | [Skip Oversized Files Instead Of Failing The Review](./053-skip-oversized-files-instead-of-failing-the-review.md) | Hardening hotfix |
| [ ] TODO | 048 | [Explain Effective Configuration Sources](./048-explain-effective-configuration-sources.md) | Real repository UX |
| [ ] TODO | 019 | [Review An Exact Committed Range](./019-review-an-exact-committed-range.md) | Real repository UX |
| [ ] TODO | 020 | [Review A Branch Using Merge-base Semantics](./020-review-a-branch-using-merge-base-semantics.md) | Real repository UX |
| [ ] TODO | 021 | [Compose Committed And Uncommitted Scopes](./021-compose-committed-and-uncommitted-scopes.md) | Real repository UX |
| [ ] TODO | 022 | [Infer A Default Branch Scope Conservatively](./022-infer-a-default-branch-scope-conservatively.md) | Real repository UX |
| [ ] TODO | 023 | [Filter Review Paths Explicitly](./023-filter-review-paths-explicitly.md) | Real repository UX |
| [ ] TODO | 025 | [Centralize File Skip Policy](./025-centralize-file-skip-policy.md) | Real repository UX |
| [ ] TODO | 024 | [Apply `.reviewstuffignore` As Exclusion-only Policy](./024-apply-reviewstuffignore-as-exclusion-only-policy.md) | Real repository UX |
| [ ] TODO | 032 | [Define The Review Exit-code Contract](./032-define-the-review-exit-code-contract.md) | Durable automation beta |
| [ ] TODO | 027 | [Define The Persisted Review Session Schema](./027-define-the-persisted-review-session-schema.md) | Durable automation beta |
| [ ] TODO | 028 | [Store And Load Sessions Atomically](./028-store-and-load-sessions-atomically.md) | Durable automation beta |
| [ ] TODO | 029 | [Persist Successful Review Sessions](./029-persist-successful-review-sessions.md) | Durable automation beta |
| [ ] TODO | 030 | [Query Stored Findings](./030-query-stored-findings.md) | Durable automation beta |
| [ ] TODO | 031 | [Replay A Deterministic Repair Prompt](./031-replay-a-deterministic-repair-prompt.md) | Durable automation beta |
| [ ] TODO | 033 | [Stream Review Events As NDJSON](./033-stream-review-events-as-ndjson.md) | Durable automation beta |
| [ ] TODO | 034 | [Aggregate A Minimal Doctor Report](./034-aggregate-a-minimal-doctor-report.md) | Durable automation beta |
| [ ] TODO | 035 | [Add A Sandboxed Codex CLI Engine](./035-add-a-sandboxed-codex-cli-engine.md) | Durable automation beta |
| [ ] TODO | 036 | [Retry Only Safe Provider Failures](./036-retry-only-safe-provider-failures.md) | Durable automation beta |
| [ ] TODO | 037 | [Persist Provider Run Metadata](./037-persist-provider-run-metadata.md) | Durable automation beta |
| [ ] TODO | 038 | [Polish The Human Review Report](./038-polish-the-human-review-report.md) | Supported macOS v1 |
| [ ] TODO | 039 | [Establish The Pull-request CI Gate](./039-establish-the-pull-request-ci-gate.md) | Supported macOS v1 |
| [ ] TODO | 040 | [Package One Release Artifact Deterministically](./040-package-one-release-artifact-deterministically.md) | Supported macOS v1 |
| [ ] TODO | 041 | [Sign And Notarize The macOS Executable](./041-sign-and-notarize-the-macos-executable.md) | Supported macOS v1 |
| [ ] TODO | 042 | [Automate A Draft Signed Release](./042-automate-a-draft-signed-release.md) | Supported macOS v1 |
| [ ] TODO | 043 | [Install The Signed Artifact With Homebrew](./043-install-the-signed-artifact-with-homebrew.md) | Supported macOS v1 |
| [ ] TODO | 044 | [Install The Signed Artifact From One npm Platform Package](./044-install-the-signed-artifact-from-one-npm-platform-package.md) | Supported macOS v1 |
| [ ] TODO | 045 | [Document The Privacy And Security Contract](./045-document-the-privacy-and-security-contract.md) | Supported macOS v1 |
| [ ] TODO | 046 | [Document Installation And First Review](./046-document-installation-and-first-review.md) | Supported macOS v1 |
| [ ] TODO | 047 | [Pass The Read-only macOS v1 Readiness Gate](./047-pass-the-read-only-macos-v1-readiness-gate.md) | Supported macOS v1 |

依本表列序執行，不以 plan 編號大小判定先後。狀態由 `TODO` → `IN PROGRESS`，完成驗收後
刪除檔案與索引列，不保留 `DONE` 狀態。目前下一個 plan 為本表第一列。

## Milestones

| Milestone | Plans | Exit state |
| --- | --- | --- |
| Hardening hotfix | 053 | 單檔過大不再讓整個 review 失敗 |
| Real repository UX | 048、019–023、025、024 | effective config provenance、一次定義完整的 scope contract、commit/branch scopes、filters、skip policy |
| Durable automation beta | 032、027–031、033–037 | exit-code contract、sessions、queries、NDJSON、doctor、Codex CLI、provider reliability |
| Supported macOS v1 | 038–047 | report polish、CI、signed artifact、Homebrew/npm、docs、readiness gate |

## Plan completion checklist

- 只改該 plan 的 scope，沒有新增後續功能 skeleton。
- 所有 acceptance criteria 有對應測試或明確 opt-in smoke evidence。
- `bun run typecheck` 通過。
- `bun test` 通過；若該命令因 repository script 觸發 build，先取得 build 授權。
- 需要 compiled artifact 的 plan 另跑它列出的 smoke commands。
- Machine-owned schema 依上方兩階段政策處理：029 之前只需 current fixture，029 起要有 current 與
  previous-version fixture 與 migration；user-authored config 維持 raw config → resolved config，只有
  實際相容需求才加入 legacy fixture。
- 新增任何 `.reviewstuff.yaml` 欄位或 CLI config override 時，同步更新 048 的 provenance source
  coverage 與 `EffectiveConfigReportV1` fixtures。
- 新增的 error 能在 human 與 machine-readable boundary 被穩定處理。
- 依當前實作更新需要長期維護的文件；下一個 plan 不需要先修正本 plan 的遺留問題。
- 刪除已完成 plan 與索引列，清理相關引用及已完成 milestone；其他 plan 的前置能力改指向
  現有程式、測試或適用文件，不保留已完成 plan 編號作為依據。

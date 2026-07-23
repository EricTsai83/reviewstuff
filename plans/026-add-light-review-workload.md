# 026 — Add the light review workload

[← Plan index](./README.md)

**Depends on:** 025。 **Learning:** reduce optional context work through one
explicit workload contract without branching the review architecture。

## Goal

讓使用者選擇 `standard` 或 `light` review workload。`light` 只縮小送入 reviewer
的 context budget；不改變 finding criteria，也不偷偷切換 engine、provider、model、timeout
或 concurrency。

這個 plan 是 config v1 `preset: "quick" | "standard"` 的正式後繼者。Plan 006
仍保留為歷史紀錄，不回頭改寫當時使用 `profile` 的已完成 contract。

## Working State

```bash
reviewstuff review
reviewstuff review --light
reviewstuff review --workload standard
reviewstuff review --workload light
```

- 未指定 CLI workload 時，依 config 決定；config 也未指定時使用 `standard`。
- `--light` 是 `--workload light` 的便利寫法。
- 同時傳入 `--light --workload standard` 時回報 usage error，不猜測優先順序。
- terminal 與 JSON report 都顯示 effective workload 與實際 request budget。

## Domain Contract

Plan 開始實作時建立以下 current contract；現在不預先加入未使用的 source skeleton：

```ts
export const ReviewWorkloadSchema = Schema.Literals(["standard", "light"])

export type ReviewWorkload = typeof ReviewWorkloadSchema.Type

export interface ReviewWorkloadPreset {
  readonly workload: ReviewWorkload
  readonly requestBudget: ReviewRequestBudgetConfig
}
```

使用 `workload`，不使用泛稱 `ReviewPolicy`，避免與 Plan 013 的 cloud privacy policy
混淆。preset 只擁有 request budget：

| Workload | maxTokens | fixed overhead | output reserve |
| --- | ---: | ---: | ---: |
| `standard` | 128,000 | 2,048 | 16,384 |
| `light` | 32,000 | 2,048 | 8,192 |

`timeoutMs`、`concurrency`、`engine`、`provider` 與 `model` 保持正交，仍由既有
config/CLI resolution 控制。

## Config Evolution

新增 config schema v2：

```json
{
  "schemaVersion": 2,
  "review": {
    "workload": "light",
    "engine": "fake",
    "provider": "fake",
    "model": "fake-reviewer-v1",
    "timeoutMs": 120000,
    "concurrency": 2
  }
}
```

loader 同時嚴格接受 v1 與 v2，並在 boundary 將 v1 migration 成 current config：

- `preset: "standard"` → `workload: "standard"`
- `preset: "quick"` → `workload: "light"`
- migration 必須保留 v1 最終解析出的 engine/provider/model/timeout/concurrency，不能因為
  新 workload 不再擁有 execution settings 而靜默改變舊 config 行為。
- 新寫出的文件與錯誤訊息只使用 v2 `workload` 術語。

Resolution precedence：explicit CLI workload > config v2 workload / migrated v1 preset >
`standard` default。其他設定仍各自維持 CLI > config > default。

## Request And Report Boundaries

`ReviewRequestV1` 保持不變。workload 在 engine boundary 之前完成 hunk selection，engine
只需要收到已正規化、已 budget 的 exact request；把 workload 塞進 provider request
會讓 Plan 016 的 adapter 無故承擔上游 policy。

Report contract 升版並加入 effective workload，舊 report migration 預設為 `standard`：

```ts
interface ReviewReportV5 {
  readonly schemaVersion: 5
  readonly workload: ReviewWorkload
  // existing scope, summary, coverage, budget, findings
}
```

Report 的 `budget` 仍是實際執行證據；`workload` 是使用者選擇與 preset 身分。若 config
另外覆寫 request budget，兩者都必須如實輸出，不可假設看到 `light` 就等於固定數值。

## Pipeline Placement

```text
scope → path filters → centralized skip policy → workload budget selection
      → redaction → preview or engine → report
```

Light workload 不得繞過 Plan 013–015 的 privacy、redaction 或 exact-request preview，且
coverage 必須照常揭露 reviewed、truncated 與 skipped hunks/files。

## In Scope

- `ReviewWorkload` schema/type 與 standard/light presets。
- config v2、v1 migration、strict decode 與 precedence tests。
- config decode 失敗時渲染欄位級錯誤細節（路徑、欄位、期望值），同時涵蓋 v1 與 v2。
- `--workload`、`--light` shortcut 與 conflict validation。
- 將 effective workload 傳給 budget selection。
- report schema evolution、migration、terminal/JSON rendering。
- standard/light budget、coverage、CLI 與 compiled-binary e2e fixtures。

## Out Of Scope

- cheaper model auto-selection。
- provider pricing或 rate-limit semantics。
- tool/analyzer depth。
- finding tone、severity threshold 或「少講一點」mode。
- timeout/concurrency tuning。
- adaptive budget、automatic workload inference 或多級 deep review。

## Implementation Slices

1. Config/domain slice：加入 workload contract、presets、config v2 migration 與 resolution tests。
2. CLI/use-case slice：加入 `--workload`/`--light`，只把 effective workload 映射到既有
   request-budget selection。
3. Observability slice：升版 report、加入 migration 與 renderer，再補 compiled binary e2e。

每個 slice 都要保持 typecheck 與既有 tests 通過；第三個 slice 完成前 Plan 026 不標 DONE。

## Acceptance Criteria

- `--light` 與 `--workload light` 產生相同 effective workload 與 normalized request。
- conflict flags 明確失敗，沒有 silent precedence。
- light 的 request budget 明確小於 standard，且可從 report 觀察。
- 相同 diff 下，light 只能減少 selected context，不能改變 selection ordering。
- 不切換 engine/provider/model/timeout/concurrency。
- v1 config migration 保留既有 effective execution settings。
- invalid config 的錯誤訊息包含欄位級 schema 細節，不再只回報整份檔案不符。
- `ReviewRequestV1` 與 Plan 016 adapter contract 不需改版。
- privacy、redaction、preview、path filtering、skip policy 與 coverage contracts 全部維持。
- source CLI 與重新 build 後的 standalone binary 都通過 smoke/e2e。

## Verification

```bash
bun run typecheck
bun test
bun run build
./dist/reviewstuff review --light --json
./dist/reviewstuff review --workload standard --json
```

依 repository 規則，`bun run build` 與 compiled-binary smoke 只在取得 build 授權後執行。

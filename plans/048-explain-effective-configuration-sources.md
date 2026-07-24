# 048 — Explain effective configuration sources

[← Plan index](./README.md)

**Depends on:** 018。 **Learning:** observable configuration provenance without
duplicating resolution logic。

> 本 plan 排在 018 之後：013、017、026 先固定 privacy、engine/provider/model 與 workload
> config contract，018 再固定 selected repository root。此時建立 provenance 可避免前期欄位
> churn，也能讓 config path 從一開始就相對於正確的 repository context。

## Goal

讓使用者看見 review 實際採用的完整設定，以及每個值來自 CLI、repository config、
provider/workload default 或 built-in default。診斷能力必須重用 review command 的同一條
resolution path，不能另外實作一套「看起來相同」的 merge。

## Working State

```bash
reviewstuff config show
reviewstuff config show --json
reviewstuff config show --dir ../repo
```

Human output 顯示 config file 狀態、effective value 與來源，例如：

```text
Config: /repo/reviewstuff.config.json (loaded)
workload      light       config: review.workload
engine        openai      cli: --engine
model         gpt-5.1     provider-default: openai
privacy       local-only  built-in-default
```

JSON output 使用 stable、versioned machine contract，讓 agent、CI 與後續 doctor 可以可靠解析。

## Contract

Config resolution 一次產生 effective config 與 provenance：

```ts
type ConfigValueSource =
  | { readonly _tag: "Cli"; readonly option: string }
  | {
      readonly _tag: "ConfigFile"
      readonly path: string
      readonly field: string
    }
  | { readonly _tag: "ProviderDefault"; readonly provider: string }
  | { readonly _tag: "WorkloadDefault"; readonly workload: ReviewWorkload }
  | { readonly _tag: "BuiltInDefault" }

type ResolvedReviewConfigSources = {
  readonly [Key in keyof ResolvedReviewConfig]: ConfigValueSource
}

interface ResolvedReviewConfigSnapshot {
  readonly config: ResolvedReviewConfig
  readonly sources: ResolvedReviewConfigSources
  readonly configFile: {
    readonly path: string
    readonly state: "loaded" | "not-found"
  }
}
```

具體名稱可在實作時依現有 module vocabulary 微調，但必須保留三個 invariants：

1. review execution 與 `config show` 使用同一個 snapshot；
2. 每個 resolved field 恰有一個來源；
3. provenance 只描述來源，不保存 credentials、environment values 或 rejected raw payload。

`requestBudget` 若由 workload 提供，來源是 `WorkloadDefault`；若 config 或 CLI 明確覆寫完整
budget，來源改為該 explicit layer。不得看到 `workload: light` 就推測 budget，effective value
仍以 snapshot 內實際 resolution 為準。

## Resolution And Output

Resolution precedence 沿用既有 contract：

```text
explicit CLI > repository config > provider/workload default > built-in default
```

`config show` 是 read-only command：

- 讀取與 review command 相同的 selected repository config；
- config 不存在時成功顯示 `not-found` 與 effective defaults；
- invalid config 沿用既有 typed config error，不降級成 defaults；
- 不初始化 engine、不讀 credentials、不呼叫 network，也不執行 review；
- human 與 JSON renderer 都只能消費 snapshot/report，不自行推導來源。

`EffectiveConfigReportV1` 應包含 schema version、config file 狀態，以及每個公開欄位的 effective
value/source。加入新 config 欄位時，必須同步更新 source coverage 與 fixtures；是否升 report
版本依 machine-contract compatibility 判斷，不以 user-authored config 的版本策略代替。

## In Scope

- Typed config provenance 與 resolved snapshot contract。
- 單一 pure resolution path 同時產生 values 與 sources。
- `reviewstuff config show [--json]` command 與 renderer。
- Stable `EffectiveConfigReportV1` schema、decoder/fixtures 與 source CLI tests。
- Config path、loaded/not-found 狀態與 field/option source labels。
- Secret-safe output policy。

## Out Of Scope

- 編輯、產生或自動修復 `reviewstuff.config.json`。
- Global、organization、central repository config 或 inheritance。
- Array merge/deduplication rules。
- Credentials、engine health、storage 或 network diagnostics（由 034 doctor 負責）。
- Watch mode、remote upload、telemetry 或 adaptive configuration。
- 任意 path prompt instructions。

## Implementation Slices

1. Resolution slice：建立 snapshot/provenance types，讓現有 review execution 消費
   `snapshot.config`，並以 pure tests 固定每個 precedence/source pairing。
2. Report slice：建立 `EffectiveConfigReportV1` 與 secret-safe mapping/fixtures。
3. CLI slice：加入 `config show` human/JSON renderer 與 source CLI/e2e tests。

每個 slice 都必須保持 review command 的 effective values 不變；不得為顯示來源而建立第二套
resolver。

## Acceptance Criteria

- 相同 config/CLI input 下，review command 與 `config show` 的 effective values 完全一致。
- 每個 `ResolvedReviewConfig` field 都有 compile-time exhaustive source coverage。
- CLI override、config value、provider default、workload default 與 built-in default 各有 fixture。
- Missing config 成功顯示 defaults；invalid config 明確失敗，沒有 silent fallback。
- `requestBudget` 顯示實際 effective values 與真正來源。
- `--dir` 選定其他 repository 時，顯示並讀取該 canonical root 的 config。
- Human/JSON output 不包含 API key、credential value、environment value、完整 raw config 或
  rejected payload。
- Command 不初始化 engine、不做 inference、不呼叫 network。
- `EffectiveConfigReportV1` strict decode、source CLI tests 與 existing review tests 全部通過。

## Verification

```bash
bun run typecheck
bun test
bun run src/index.ts config show
bun run src/index.ts config show --json
```

依 repository 規則，不在本 plan 未獲授權時執行 build。

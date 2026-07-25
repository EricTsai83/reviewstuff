# 049 — Adopt repository-root YAML configuration

[← Plan index](./README.md)

**Depends on:** 018。 **Learning:** a strict human-authored serialization boundary。

## Goal

把尚未發布的 `cwd/reviewstuff.config.json` prototype 一次替換成 repository-scoped
`.reviewstuff.yaml` contract。這是初期專案的直接契約修正，不建立 migration、legacy fallback、
deprecated alias 或雙格式 precedence。

## Working State

每個 selected Git working-tree repository 最多有一份 optional config：

```text
repository-root/
├── .reviewstuff.yaml
├── src/
└── package.json
```

```yaml
review:
  preset: standard
  engine: fake
  provider: fake
  model: fake-reviewer-v1
  timeoutMs: 120000
  concurrency: 2
```

從 repository root、nested directory 或 `--dir` 指定路徑執行時，都只讀取：

```text
<selected-repository-root>/.reviewstuff.yaml
```

檔案不存在時使用 defaults；檔案存在但無法安全解析或不符合 Effect Schema 時立即失敗。

## Canonical Contract

- 唯一正式檔名是 `.reviewstuff.yaml`。
- 不讀取 `reviewstuff.config.json`、`.reviewstuff.yml` 或其他 aliases。
- 不提供 migration、compatibility warning、automatic rewrite 或 legacy fallback。
- Blank 或 comment-only YAML 視為空設定 `{}`；explicit `null`、scalar 或 sequence 不是有效 root config。
- Resolution precedence 維持 `explicit CLI > repository config > built-in/preset defaults`。
- User-authored config 維持 raw config → resolved config，不因格式切換加入 `schemaVersion`。

JSON flow syntax 本身是 YAML 1.2 的合法子集，因此出現在 `.reviewstuff.yaml` 內不需額外禁止；
「不支援 JSON」指的是不再尋找或解析 legacy JSON config file。

## Strict YAML Boundary

將 `yaml` 宣告為直接 runtime dependency。Parser 只接受一份 YAML 1.2 document，並限制為
JSON-compatible data model：

- mapping keys 必須是 strings；
- values 只能是 mapping、sequence、string、finite number、boolean 或 null；
- duplicate keys、custom tags、anchors、aliases、merge keys與 multiple documents 全部拒絕；
- parser warnings 視為 invalid config，不得 silent recovery；
- parse 結果先視為 `unknown`，再交給 `ReviewstuffConfigSchema` strict decode；
- Effect Schema 繼續使用 excess-property rejection，不信任 parser output。

不得用 YAML parser 的 TypeScript inference 取代 Effect Schema，也不得讓 YAML-specific node types
流入 config resolution 或 review domain。

## Errors

Config boundary 必須區分：

1. file read failure；
2. YAML syntax/feature rejection；
3. decoded value 不符合 supported config schema。

Human error 可顯示 config path、line/column、safe field path 與 expected constraint，但不得回顯
rejected scalar、完整 raw config、credentials、stack trace 或 parser internals。既有 typed config
error/rendering contract 應依這三層更新；machine-facing code 不靠 message parsing 判斷種類。

## In Scope

- `.reviewstuff.yaml` filename contract 與 repository-root lookup integration。
- Direct `yaml` dependency、strict parser wrapper 與 Effect Schema decode boundary。
- 移除 `ReviewstuffConfigJsonSchema` 及 JSON-string-specific decoding。
- Config read/parse/schema typed errors與 secret-safe rendering。
- Unit fixtures：valid、blank、comment-only、missing、unknown field、invalid scalar/root、duplicate key、
  anchor/alias、custom tag、multiple documents。
- Temporary-repository/e2e fixtures：root、nested cwd、`--dir`、invalid YAML，以及 legacy filename 不被載入。
- 將現行 reference/usage documentation 更新為 implemented `.reviewstuff.yaml` behavior。

## Out Of Scope

- `preset` → `workload` terminology（Plan 026）。
- Privacy、provider/model selection 或新增 config fields。
- `config show` 與 value provenance（Plan 048）。
- Global、organization、central repository config、inheritance或 remote config。
- `--config` arbitrary path override。
- Config generation、editor UI、auto-fix或 JSON Schema hosting。

## Implementation Slices

1. Parser slice：加入 direct dependency與 strict YAML-to-unknown parser，建立 feature-rejection fixtures。
2. Config slice：切換 canonical filename/decode/error contract，刪除 JSON loader並更新 unit tests。
3. Repository/e2e slice：驗證 root、nested cwd、`--dir` 與 legacy filename absence，再同步 current
   implementation/reference docs。

每個 slice 都要保持 typecheck 與既有 tests 通過；第三個 slice 完成前 Plan 049 不標 DONE。

## Acceptance Criteria

- 同一 selected repository 不會因 invocation cwd 不同而採用不同 config。
- `--dir` 的 config 與 reviewed diff 必定來自同一 canonical repository root。
- 只載入 `.reviewstuff.yaml`；legacy JSON filename 不會被讀取或影響 effective config。
- Missing、blank 與 comment-only config 成功使用 defaults。
- Invalid YAML feature與 invalid typed config 都 fail closed，且 error category 可穩定判別。
- Duplicate keys、aliases/anchors、custom tags與 multiple documents 有明確 rejection fixtures。
- Unknown fields、invalid integers與 unsupported literals 仍由 Effect Schema 嚴格拒絕。
- Error output 提供可修復位置但不洩漏 rejected values、raw config 或 stack trace。
- Config precedence 與既有 effective values 除 serialization boundary 外不變。
- Source CLI 與重新 build 後的 standalone binary 都通過 config e2e。

## Verification

```bash
bun run typecheck
bun test
bun run build
./dist/reviewstuff review --json
```

依 repository 規則，`bun run build` 與 compiled-binary smoke 只在取得 build 授權後執行。

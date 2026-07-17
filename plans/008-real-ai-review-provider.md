# 008 - Real AI Review Provider

## Goal

讓 `reviewstuff review` 能呼叫第一個真實 AI provider，對本機變更產生 structured code review findings。

## Working State

完成後可以執行：

```bash
reviewstuff review --engine openai --model <model-id> --json
```

若沒有設定 credentials，CLI 會清楚說明缺少哪個環境變數或 provider CLI。

## Scope

包含：

- `src/engines/openai-review-engine.ts`
- `src/review/prompts/system.ts`
- `src/review/prompts/build-review-request.ts`
- structured finding response schema
- OpenAI Responses API structured output (`text.format` JSON Schema)
- model selection from CLI/config/env
- provider timeout、output cap
- provider diagnostics in `doctor`

不包含：

- OAuth
- PR comments
- GitHub App
- auto-fix apply
- deep review tool loop
- provider-specific streaming UI
- Anthropic adapter
- Codex CLI/local adapter
- retry/backoff/cost controls

## Provider Strategy

先支援一種 provider mode：

- OpenAI cloud API: 透過 API key 呼叫指定 model，回傳 structured JSON findings。

provider adapter 只能接收 normalized `ReviewRequestV1`，不得直接讀 git 或 filesystem。
OpenAI adapter 使用 Responses API 的 structured output；request schema 使用
`text.format` 的 `json_schema` 並開啟 strict mode，不使用舊的 JSON mode。adapter 必須分別
處理 successful structured response、refusal、`incomplete`、empty output 與 transport/API error。

`src/review/` 在這個 plan 才首次建立，只包含 pure prompt construction、review
policy 與 request normalization；application flow 留在 `use-cases/`，provider IO 留在
`engines/`。`review/` 不得依賴 platform service、provider SDK 或 runtime API。

Anthropic 與 Codex CLI/local provider 留到 009，避免第一個 real-provider plan 同時學 cloud SDK、local subprocess provider、provider-specific error mapping。

## Model Selection

model 不寫死在 core。解析優先序：

1. CLI flag：`--model <model-id>`
2. config：`review.model`
3. provider env default：例如 `REVIEWSTUFF_OPENAI_MODEL`
4. built-in provider default

每次 review session 必須記錄實際使用的 engine/provider/model/transport，方便 debug 與重現。

## Prompt Strategy

參考 OpenReview 的 review 原則，但轉成 local CLI structured review：

- review diff for correctness, security, performance, missing error handling, race conditions, and regressions
- be specific and reference file paths and line numbers
- explain problem, impact, and suggested fix
- do not nitpick style/formatting unless it causes real risk
- return only structured JSON matching `ReviewFindingV1[]`

Prompt input 包含：

- repo metadata
- normalized unified diff from selected scope
- changed file summaries
- selected file context snippets
- config/profile/reviewer ids
- analyzer diagnostics if available

## Output Contract

AI provider 必須回傳可 parse 的 structured result，並映射到 007 已建立的 normalized
`ReviewFindingV1`（以下是 provider JSON contract，不建立第二套 public finding type）：

```ts
interface ReviewFindingV1 {
  id: string
  severity: "low" | "medium" | "high" | "critical"
  category: "correctness" | "security" | "performance" | "maintainability" | "testing" | "architecture"
  file: string
  line?: number
  title: string
  description: string
  impact: string
  suggestion: string
  confidence: "low" | "medium" | "high"
}
```

Invalid JSON、schema mismatch、refusal、incomplete response、empty response 都要轉成可區分的
typed provider error。即使 provider 宣稱遵守 JSON Schema，邊界仍要以 Effect schema 驗證，
不能直接信任 SDK/HTTP response。

## OpenReview Adaptation

OpenReview 的可借鑑部分：

- agent system prompt 明確定義 review 重點、工具能力、輸出風格。
- progressive skills：只先露出 skill metadata，需要時再載入完整 instructions。
- tool output truncation：避免 command/read-file output 撐爆 context。
- bounded execution：max steps/token budget/output cap。

本 CLI 的取捨：

- 不使用 Vercel Sandbox；本機 review 只使用 repo root path containment 和 command runner 限制。
- 不使用 GitHub PR comments；finding 先輸出 terminal/JSON/session。
- 第一版 real provider 不給任意 shell tool；只做 single-shot structured review。

## Implementation Steps

1. 定義 `ReviewRequestV1` 與 structured provider response schema。
2. 建立 local review system prompt 與 request builder。
3. 在 `openai-review-engine.ts` 實作具名 OpenAI adapter；這是 fake 之後的第二個
   `ReviewEngine` implementation、也是第一個 provider implementation，此時才加入最小
   selection/composition。HTTP/SDK dependency 只存在於 concrete adapter，不進入 contract。
4. 將 `review --engine openai --model <model-id>` 接到 real provider。
5. provider error 轉成清楚的 CLI error 與 doctor diagnostics。
6. 只產生不含 prompt、diff、response body 或 credentials 的 debug metadata，供 010
   session storage 接入；完整 prompt/request snapshot 與 redaction policy 留到 029。

## Verification

```bash
bun run test
OPENAI_API_KEY=<key> ./dist/reviewstuff review --engine openai --model <model-id> --json
./dist/reviewstuff doctor --json
```

Live smoke 可用小型 fixture repo，故意放入一個明顯 correctness bug，確認 provider 產生 structured finding。

## Acceptance Criteria

- local working tree diff 可以透過真實 provider 產生 findings，且不要求 `git add`。
- OpenAI provider 走 `ReviewEngine` contract，且 contract 不含 OpenAI-specific types。
- model 可以由 CLI/config/env/default 選擇。
- provider output schema validation 穩定。
- refusal、incomplete、empty output 與 schema mismatch 有不同 typed error/remediation。
- credentials 缺失時有清楚 remediation。
- provider timeout/output cap 生效。
- fake engine 仍可用於 deterministic tests。

## Learning Focus

- 將 OpenReview 的 agent prompt 思想收斂成 local CLI structured review。
- 第一個 cloud provider adapter 邊界。
- LLM structured output validation 與 failure handling。

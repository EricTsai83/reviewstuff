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

- `src/engines/openai.ts`
- `src/review/prompts/system.ts`
- `src/review/prompts/build-review-request.ts`
- structured finding response schema
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

AI provider 必須回傳可 parse 的 structured result：

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

Invalid JSON、schema mismatch、empty response 都要轉成 typed provider error。

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
3. 實作 OpenAI adapter。
4. 將 `review --engine openai --model <model-id>` 接到 real provider。
5. provider error 轉成清楚的 CLI error 與 doctor diagnostics。
6. 保存 request/response 的 redacted debug metadata，供 009 session storage 接入。

## Verification

```bash
bun run test
AI_REVIEW_ENGINE=openai AI_REVIEW_MODEL=<model-id> ./dist/reviewstuff review --json
./dist/reviewstuff doctor --json
```

Live smoke 可用小型 fixture repo，故意放入一個明顯 correctness bug，確認 provider 產生 structured finding。

## Acceptance Criteria

- local working tree diff 可以透過真實 provider 產生 findings，且不要求 `git add`。
- OpenAI provider 走 `ReviewEngine` contract，且 contract 不含 OpenAI-specific types。
- model 可以由 CLI/config/env/default 選擇。
- provider output schema validation 穩定。
- credentials 缺失時有清楚 remediation。
- provider timeout/output cap 生效。
- fake engine 仍可用於 deterministic tests。

## Learning Focus

- 將 OpenReview 的 agent prompt 思想收斂成 local CLI structured review。
- 第一個 cloud provider adapter 邊界。
- LLM structured output validation 與 failure handling。

# 035 - Documentation And Onboarding

## Goal

補齊使用者真的採用 CLI 需要的文件、範例、故障排除。

## Working State

完成後新使用者可以從 README 安裝、設定 provider、跑第一個 review、理解資料會送去哪裡。

## Scope

包含：

- README quickstart
- install docs：local/Homebrew/npm/direct tarball
- provider setup：OpenAI、Anthropic、Codex/local CLI
- config examples
- privacy/security docs
- troubleshooting guide
- example reports
- migration/update notes
- agent workflow recipes

不包含：

- marketing site
- hosted dashboard
- full enterprise policy docs

## Implementation Steps

1. 更新 README quickstart。
2. 新增 `docs/providers.md`。
3. 新增 `docs/configuration.md`。
4. 新增 `docs/privacy.md`。
5. 新增 `docs/troubleshooting.md`。
6. 新增 `docs/agent-workflows.md`，示範 `review --agent`、修 high/critical、二次 review、iteration limit。
7. 確保所有 docs commands 在 smoke test 中可跑或明確標示需要 credentials。

## Verification

```bash
bun run test
./dist/reviewstuff doctor
./dist/reviewstuff review --engine fake
```

## Acceptance Criteria

- 使用者不看 source 也能完成 first review。
- provider setup 失敗有對應 troubleshooting。
- privacy docs 與實際資料流一致。
- agent workflow docs 不要求解析 human output，只使用 NDJSON events。
- docs 明確說明 `--fast` / `--light`、`review findings`、`review prompts --finding`。
- docs 中所有無 credentials commands 都由 doctest/smoke harness 執行；需要 cloud credentials、
  Apple signing 或 release 權限的命令明確標示 prerequisites 與可能成本/副作用。

## Learning Focus

- CLI developer experience。
- docs as part of production readiness。

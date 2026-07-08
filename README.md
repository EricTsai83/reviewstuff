{
  "profile": "standard",
  "concurrency": 3,
  "timeoutSeconds": 180,
  "failOn": "error",
  "rulesFile": ".reviewstuff/rules.md",
  "verify": { "enabled": false, "model": "openai-codex/gpt-5.4-mini" },
  "gates": {                            // reviewstuff fix 的驗證閘門
    "typecheck": "pnpm typecheck",
    "test": "pnpm test"
  },
  "reviewers": {
    "correctness": { "model": "openai-codex/gpt-5.5" },
    "security":    { "model": "anthropic/claude-sonnet-5", "engine": "claude" },
    "architecture": { "enabled": true },
    // 自訂 reviewer：非內建 id + prompt 檔
    "naming": { "prompt": ".reviewstuff/naming.md", "model": "openai-codex/gpt-5.5" }
  }
}
```

`reviewstuff init` 產生範本；`reviewstuff reviewers` 列出目前配置與登入狀態。

## Claude Code 整合

### Skill（推薦）

`skills/reviewstuff/SKILL.md` 讓 agent 在 commit 前自己呼叫 `reviewstuff`、拿 JSON 修完再跑一次。複製到你的 `.claude/skills/`。

### Stop hook（嚴格模式，選配）

每次 agent 停下來自動審 staged 變更。`.claude/settings.json`：

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "git diff --cached --quiet || reviewstuff --staged --engine codex --json --fail-on error" }
        ]
      }
    ]
  }
}
```

> 注意：hook 每輪都消耗訂閱額度。建議搭 `--profile quick` 或只在特定時機手動跑 skill。

## 架構

```
CLI (commander) → Effect 程式
  ├─ GitService（diff/worktree）      ├─ ConfigService（檔案+flag 合併）
  ├─ Engines（pi / claude / codex / fake）
  ├─ Orchestrator（平行 fan-out + timeout/retry/部分失敗 + dedup）
  ├─ verify / baseline / fix（worktree 閘門）
  └─ Output（terminal / json）
```

Runtime 用 **Effect v4 beta**。引擎抽象成 `ReviewEngine` 介面，pi 的 API 只出現在 `engines/pi.ts`、各家 CLI 的 flag 只出現在對應引擎檔。純邏輯（diff-parse、dedup、報告）不碰 Effect。

## 開發

```bash
pnpm dev -- --help     # tsx 直跑
pnpm typecheck
pnpm test              # vitest（live smoke 需 RUN_LIVE=1，會燒真額度）
pnpm build             # tsdown 單檔 ESM bin
```

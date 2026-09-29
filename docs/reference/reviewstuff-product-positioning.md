# reviewstuff Product Positioning and Niche

- **Date:** 2026-09-29

## Positioning

reviewstuff is an **independent reviewer for coding agents and CI to call**, not another coding agent.

Review commands built into coding agents, such as Codex CLI `/review`, Claude Code `/review`, and Cursor Agent
Review, need no setup, can read the whole repository, and let the developer fix findings in the same session.
They already serve the "one developer, one agent, a second look before committing" case. reviewstuff serves the
needs they cannot meet.

## Niche

### 1. An independent second opinion

When the same agent and model family review the code they just wrote, they tend to share the same blind spots.
reviewstuff can use a different provider, model, and review process, giving a judgment independent of the agent
that wrote the code.

### 2. One review standard across the team

Each developer uses a different agent and configuration, so review standards drift. reviewstuff defines review
behavior in `.reviewstuff.yaml` at the repository root, so the same rules apply no matter who runs it or which
agent they use.

### 3. Gating and automation

CI and pre-push hooks need a stable exit code and a fixed output format to decide whether to pass. Agent review
output is written for humans and has no fixed format. reviewstuff provides a versioned report schema and an
explicit exit code contract.

### 4. Controlled data flow

A coding agent can read any file in the repository, including `.env`. reviewstuff explicitly controls what leaves
the machine: privacy mode defaults to local-only, secrets are redacted before sending, and `--dry-run-request`
previews exactly what will be sent. For teams that cannot hand source code to third parties freely, this is a
prerequisite for adoption.

### 5. Predictable cost

How much an agent reads and how long it runs varies from run to run. reviewstuff bounds each review with a request
budget and workload, so cost can be estimated before the review runs.

### 6. Agent-agnostic

reviewstuff is a standalone CLI. Claude Code, Codex, or Cursor can call it inside a write → review → fix loop, and
it also runs on its own without any agent.

### 7. Persistent, traceable results

Agent review results are scattered across conversations. reviewstuff saves each review as a session that can later
be queried, compared, and traced.

## Industry evidence

Dedicated review CLIs are moving in the same direction. CodeRabbit CLI emphasizes integration with coding agents
such as Claude Code, Codex, and Cursor, acting as the independent reviewer an agent calls inside its loop rather
than competing with the agent directly.

## References

Public sources as of September 2026.

- Codex CLI `/review` reports findings without modifying code: [Inventive HQ](https://inventivehq.com/knowledge-base/openai/how-to-use-codex-for-code-review)
- Major AI review tools have all shipped a CLI in the past year: [Macroscope](https://macroscope.com/content/best-ai-code-review-cli-tools-2026)
- CodeRabbit CLI integration with coding agents: [CodeRabbit CLI docs](https://docs.coderabbit.ai/cli), [Claude Code integration](https://docs.coderabbit.ai/cli/claude-code-integration)
- Cursor Agent Review: [Agent Review](https://cursor.com/docs/agent/agent-review)

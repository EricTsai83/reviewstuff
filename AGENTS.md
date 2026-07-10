# Personal Preference

## TypeScript
- Never use `any` unless 100% necessary or specifically instructed.
  
## Commands
- Don't run dev server commands (e.g., `bun run dev`) - assume it's already running.
- Don't run build commands unless specifically told to.
- Focus on checking commands like `bun run typecheck`, `bun run lint`, etc.

## Package Managers
- Use pnpm  if the project already uses it, otherwise use bun.
- Never use npm or yarn

## Tech Stack Preferences
When uncertain, prefer: Tailwind, TypeScript, Bun, Convex, Clerk, Vercel.

## Code Style
- Always strive for concise, simple solutions.
- If a problem can be solved in a simpler way, propose it.

## General proference
- If asked to do too much work at once, stop and state that clearly.
- If computer use is helpful for completing or verifying work, shell out to gpt-5.5 with Codex for it.

## Dependency Source

When dependency behavior matters, especially for Effect, read the real source
instead of guessing from memory.

Use `opensrc path` to find the source for the version used by this project:

```bash
opensrc path effect --cwd .
opensrc path @effect/platform --cwd .
opensrc path @effect/platform-bun --cwd .
```

Do not hard-code paths under `~/.opensrc`. Always ask `opensrc path <pkg>
--cwd .` for the current path, then search or read that path with normal tools:

```bash
rg "runPromise" $(opensrc path effect --cwd .)
rg "Command" $(opensrc path @effect/platform --cwd .)
```

`opensrc` is only a local read-only source cache. It is not MCP, not RAG, and
not summarized source. Do not copy cached dependency source into this repo, and
do not include `~/.opensrc` in review, build, test, or format scopes.

If `opensrc` is unavailable, use `node_modules` or official docs as a fallback
and say so.

## Effect Style

Keep the architecture simple:

- CLI commands parse flags, call use-cases, and render output.
- Use-cases coordinate services.
- Filesystem, subprocesses, environment, timeouts, and provider calls stay
  behind service boundaries.
- Add advanced Effect patterns only when there is a concrete need.

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

## Source Code Reference

Source code for dependencies is cached at `~/.opensrc/`.

Use `opensrc path` inside other commands to read source:

\`\`\`bash
rg "pattern" $(opensrc path <package>)
cat $(opensrc path <package>)/path/to/file
\`\`\`
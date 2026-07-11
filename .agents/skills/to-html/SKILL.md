---
name: to-html
description: Convert the current conversation context into a polished standalone HTML article saved under this project's docs folder.
disable-model-invocation: true
---

# To HTML

Turn the useful knowledge from the current context into a standalone `.html` article.

## Workflow

1. Extract durable content: explanations, examples, tradeoffs, caveats, code, commands, links, and next steps worth rereading.
2. Omit conversation noise: tool logs, hidden reasoning, acknowledgements, and irrelevant back-and-forth.
3. Preserve the user's primary language unless they ask for another language.
4. Choose the format:
   - Use a clean prose article by default.
   - If the content is easier to understand as a comparison, plan, report, code review, diagram, table, design sheet, or small interactive tool, read `HTML-ARTICLE-DESIGN-PATTERNS.md` and pick one primary pattern.
5. Save the article under `./docs` from the current project root. Create the folder if needed.
6. Use a concise topic filename, such as `effect-cli-command-guide.html`.
7. After the first complete draft, read `IMPROVE-HTML-ARTICLE.md` and apply one revision pass directly to the file.
8. Read `DESIGN-SYSTEM.md` and apply it as the final visual-system pass unless the user explicitly requested a different design system or no design-system pass.
9. Run `bun .agents/skills/to-html/scripts/highlight-code-blocks.mjs <html-file>` to apply deterministic static highlighting to code blocks.
10. Verify the final file, then report the relative path and a short summary.

## Article Requirements

- Write an article, not a transcript, Q&A log, or notes dump.
- Do not mention that the article came from a conversation, thread, chat, user, or assistant unless explicitly requested.
- Keep the HTML self-contained: inline CSS, inline SVG when useful, and only small local JavaScript when interaction is needed.
- Do not rely on CDN assets, remote fonts, external images, runtime Mermaid, or browser-side syntax highlighters.
- Make the article pleasant to read on mobile and desktop with clear hierarchy, readable line lengths, and intentional spacing.
- Use visual elements only when they clarify the content.
- By default, use `DESIGN-SYSTEM.md` for CSS tokens, typography, spacing, component styling, and final visual consistency.

## Article Structure

Use this default structure unless the content clearly needs a specialized pattern:

1. `<h1>` with the exact topic or artifact title.
2. One short deck paragraph that states what the article helps the reader understand or do.
3. Body sections ordered from foundation to application to caveats or decision rules.
4. A compact closing section only when it adds durable guidance, such as practical rules, checks, or references.

Avoid decorative article furniture:

- Do not add eyebrow/kicker text above the title by default.
- Do not add badges, category labels, metadata rows, or decorative subtitles unless they carry information the reader needs.
- Do not introduce visual components before the title.
- Do not use a hero treatment for technical notes, guides, or explanations unless explicitly requested.

## Code Blocks

When code is important:

- Use `<pre><code>` and preserve indentation, backslashes, and multiline syntax.
- Escape code correctly: `&` as `&amp;`, `<` as `&lt;`, and `>` as `&gt;`.
- Add a language label for code that should be highlighted, using `<pre><span class="label">TypeScript</span><code>...</code></pre>` or `<pre><span class="label">Shell</span><code>...</code></pre>`.
- Use the bundled `scripts/highlight-code-blocks.mjs` script for deterministic static highlighting after the article and design-system pass are complete.
- Keep highlighting markup in the saved HTML. Do not ship a runtime highlighter.

## Final Check

Before finishing, confirm:

- The file exists under `./docs`.
- It is a complete standalone HTML document.
- The original language is preserved.
- There are no remote runtime dependencies.
- Code blocks, if present, preserve escaping, indentation, and static highlighting markup.
- No default eyebrow/kicker, badge row, or decorative metadata appears above the title.

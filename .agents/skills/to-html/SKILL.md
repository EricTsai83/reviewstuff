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
   - If the content involves a workflow, pipeline, decision path, state transition, layer boundary, or arrows between concepts, read `HTML-SVG-FLOW-DIAGRAMS.md` and add a concise inline SVG diagram when it clarifies the article. For these diagrams, author Mermaid as an intermediate format and render it to inline SVG at build time; do not include Mermaid source or runtime Mermaid in the final HTML.
5. Save the article under `./docs` from the current project root. Create the folder if needed.
6. Use a concise topic filename, such as `effect-cli-command-guide.html`.
7. After the first complete draft, read `IMPROVE-HTML-ARTICLE.md` and apply one revision pass directly to the file.
8. Read `DESIGN-SYSTEM.md` and apply it as the final visual-system pass unless the user explicitly requested a different design system or no design-system pass.
9. Run `bun .agents/skills/to-html/scripts/highlight-code-blocks.mjs <html-file>` to apply deterministic static highlighting to code blocks.
10. Run `bun .agents/skills/to-html/scripts/validate-html.mjs <html-file>` and fix every reported issue.
11. Verify the final file, then report the relative path and a short summary.

## Visual QA For Figures

When the article contains SVG diagrams, charts, figures, or other spatial layouts:

1. After the design-system pass and code highlighting, render the final HTML in a browser or preview at desktop width and mobile/narrow width.
2. Capture or inspect the rendered figure pixels, not only the SVG source or DOM bounding boxes.
3. If a figure has separate desktop and mobile variants, verify the rendered/computed visibility at both widths: exactly one variant is visible and the other has `display: none`, `visibility: hidden`, or equivalent zero-rendered size. Do not rely on the DOM containing both variants; both may exist in source, but only one may render per viewport.
4. Check that labels are readable, labels stay inside their shapes, arrows do not run through text, nodes do not overlap, captions do not collide with the figure, and the figure is not cramped on mobile.
5. If the figure fails visual QA, revise the layout and repeat the rendered check before delivery.
6. Prefer simplifying the figure over forcing dense content into a small SVG: split it into two figures, convert it to a table, or use a vertical layout.

Use the available browser preview/screenshot tooling when possible. If browser preview is unavailable, use the best concrete fallback available, such as a headless browser already present in the environment, PDF/image rendering, or explicit geometry checks. Do not add browser or diagram tooling to the project dependencies only for QA. State any verification limitation in the final response.

## Scope

- Center the article on the useful knowledge from the current conversation thread.
- You may add outside context or research, including web research, when it improves accuracy or clarity.
- Do not make the current repository/codebase the focus, cite it, or infer article content from it unless the user explicitly asks for that.
- For learning articles, prefer small pedagogical demo code over code from the current repo or conversation. Use repo-specific code only when the article is explicitly about that code.

## Responsive Figures

- A figure may use different SVGs for desktop and mobile when layout clarity improves, such as horizontal desktop flow and vertical mobile flow.
- Scope the CSS so exactly one SVG variant is visible per viewport. Use an explicit mutually-exclusive pattern, for example:

```css
.figure .figure-mobile { display: none; }
@media (max-width: 640px) {
  .figure .figure-desktop { display: none; }
  .figure .figure-mobile { display: block; }
}
```

- Ensure the responsive visibility selectors are at least as specific as any base SVG rule such as `.figure svg { display: block; }`; otherwise the base rule can override the hide rule and render both variants.
- Do not name responsive figure classes inconsistently between the CSS and SVG markup. If the CSS hides `.figure-mobile`, the mobile SVG must actually have `class="figure-mobile"` or include that class in its class list.
- Verify both desktop and mobile renderings with a browser/preview check that confirms the visible SVG count for each responsive figure is exactly one. Treat “both SVGs appear on screen” as a blocking failure, even if text fit and geometry checks pass.

## Article Requirements

- Write an article, not a transcript, Q&A log, or notes dump.
- Do not mention that the article came from a conversation, thread, chat, user, or assistant unless explicitly requested.
- Keep the HTML self-contained: inline CSS, inline SVG when useful, and only small local JavaScript when interaction is needed.
- Do not rely on CDN assets, remote fonts, external images, runtime Mermaid, or browser-side syntax highlighters.
- Make the article pleasant to read on mobile and desktop with clear hierarchy, readable line lengths, and intentional spacing.
- Use visual elements only when they clarify the content. Prefer inline SVG over ASCII art. Mermaid may be used only as a temporary authoring format that is rendered and inlined before delivery.
- By default, use `DESIGN-SYSTEM.md` for CSS tokens, typography, spacing, component styling, and final visual consistency.

## Mermaid Rendering

Mermaid is a skill/tooling dependency, not an application dependency for the current repository.

- Do not add `@mermaid-js/mermaid-cli`, Mermaid runtime packages, Puppeteer, or diagram tooling to the project root `package.json`.
- Do not leave `.mmd`, generated `.svg`, or other intermediate diagram files in the repository unless the user explicitly asks for retained sources.
- Do not include Mermaid source, Mermaid scripts, CDN links, or browser-side Mermaid rendering in the final HTML.
- Use `MERMAID_CLI_BIN` when the environment provides a pinned `mmdc` binary.
- Otherwise use the bundled script, which invokes `bunx --package @mermaid-js/mermaid-cli mmdc` as a tool-scoped build step.
- Render Mermaid to SVG, sanitize/post-process it, inline the final SVG inside the article, then delete temporary files.
- If Mermaid rendering is unavailable and the diagram is small, fall back to a manually written inline SVG only after noting the fallback in your working update.

## Article Structure

Use this default structure unless the content clearly needs a specialized pattern:

1. `<h1>` with the exact topic or artifact title.
2. One short deck paragraph that states what the article helps the reader understand or do.
3. Body sections ordered from foundation to application to caveats or decision rules.
4. A compact closing section only when it adds durable guidance, such as practical rules, checks, or references.
5. If references are included, format them as a concise `<ul>` list.

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

## Markdown Cleanup

Before final delivery, convert prose Markdown artifacts to semantic HTML:

- Inline code in prose must use `<code>...</code>`, not backticks.
- Lists, emphasis, and headings must be real HTML elements, not Markdown syntax.
- Backticks may remain only inside `<pre><code>` when they are valid source code, such as TypeScript template literals.

## Final Check

Before finishing, confirm:

- The file exists under `./docs`.
- It is a complete standalone HTML document.
- The original language is preserved.
- There are no remote runtime dependencies.
- Code blocks, if present, preserve escaping, indentation, and static highlighting markup.
- No prose Markdown artifacts remain, including inline-code backticks outside code blocks.
- No empty CSS rulesets or empty `style` attributes remain, including inside generated inline SVG.
- No default eyebrow/kicker, badge row, or decorative metadata appears above the title.
- Responsive figure variants are mutually exclusive in rendered output: desktop width shows only the desktop variant, and mobile/narrow width shows only the mobile variant.
- Any SVG diagrams or spatial figures have passed rendered visual QA at desktop and mobile/narrow widths, or the final response states the fallback verification limitation.

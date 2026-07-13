---
name: to-html
description: Convert the current conversation context into a polished standalone HTML article saved under this project's docs folder.
disable-model-invocation: true
---

# To HTML

Turn the durable knowledge in the current context into a standalone `.html` article.

## Workflow

1. Extract explanations, examples, tradeoffs, caveats, code, commands, links, and next steps worth rereading. Omit tool logs, acknowledgements, and irrelevant back-and-forth.
2. Treat the conversation as source material, not as the outline. Organize the article around the subject and preserve the user's primary language unless asked otherwise.
3. If the article teaches or explains a subject, plan its learning path before drafting by following `Learning Articles` below.
4. Choose the format:
   - Use a clean prose article by default.
   - Read `HTML-ARTICLE-DESIGN-PATTERNS.md` when a comparison, plan, report, code review, design sheet, diagram, table, or small interactive tool would communicate the material better.
   - Read `HTML-SVG-FLOW-DIAGRAMS.md` when a workflow, decision, state transition, boundary, or relationship needs a figure. Follow that reference for authoring, rendering, responsive behavior, and visual QA.
5. Write a complete standalone HTML document and save it under `./docs` from the project root. Create the folder if needed and use a concise topic filename such as `effect-cli-command-guide.html`.
6. After the first complete draft, read `IMPROVE-HTML-ARTICLE.md` and apply one revision pass directly to the file.
7. Read `DESIGN-SYSTEM.md` and apply it as the final visual-system pass unless the user requested a different design system or no design-system pass.
8. Run `bun .agents/skills/to-html/scripts/highlight-code-blocks.mjs <html-file>`.
9. Run `bun .agents/skills/to-html/scripts/validate-html.mjs <html-file>` and fix every reported issue.
10. Verify the final file, then report its relative path and a short summary. State any visual-QA limitation when figures could not be rendered and inspected.

## Content Rules

- Write an article, not a transcript, Q&A log, or notes dump. Do not mention its conversational origin unless explicitly requested.
- Center every section on durable knowledge. Remove material that only preserves thread history.
- Start with the `<h1>` topic title. Do not put an eyebrow/kicker, badge row, metadata strip, decorative label, or hero treatment above it, even when the default design-system pass is skipped.
- Keep technical articles prose-first; do not use marketing-style hero, split media/text, or decorative section-card layouts.
- Do not make the current repository or its code the subject, cite it, or infer content from it unless the user explicitly asks for that.
- For general learning articles, prefer small pedagogical examples over repository-specific code.
- Add outside context or research only when needed for accuracy or standalone completeness, and verify it before inclusion.
- Explain rationale, boundaries, and tradeoffs when they affect how the reader should understand or apply the subject.

## Learning Articles

For educational or explainer content:

1. Define the reader's likely starting point and the concrete understanding or ability they should gain.
2. Order concepts by prerequisite: foundation, mental model, guided example, mechanics, tradeoffs, application, and practical checks. Adjust this sequence when the subject requires it.
3. Merge fragmented questions into concepts and add the connective explanations needed by a reader who never saw the source conversation.
4. Prefer one running example that gains complexity. Introduce each concept before examples or decisions that depend on it.
5. End with durable decision rules, checks, or a useful next exercise when they help the reader apply the material independently.

Before delivery, confirm that the headings express the subject's progression, every section advances the learning outcome, and the article is understandable without the source conversation.

## HTML Requirements

- Keep the document self-contained with inline CSS, inline SVG when useful, and only small local JavaScript when interaction adds value.
- Do not rely on remote fonts, external images, CDNs, runtime Mermaid, browser-side syntax highlighting, or other remote runtime dependencies.
- Use semantic HTML rather than prose Markdown artifacts. Inline code belongs in `<code>`; lists, emphasis, and headings must use their corresponding HTML elements.
- Use `<pre><code>` for code blocks, preserve indentation and multiline syntax, and escape `&`, `<`, and `>` correctly. When identifying a language for the bundled highlighter, use this exact structure: `<pre><span class="label">TypeScript</span><code>...</code></pre>` (replace `TypeScript` with the appropriate language).
- Use visuals only when they clarify the content. Prefer inline SVG over ASCII art and follow `HTML-SVG-FLOW-DIAGRAMS.md` for diagram-specific requirements.
- For any figure with separate desktop and mobile variants—not only flow diagrams—make the variants mutually exclusive. Hide one by default, swap them in the media query, and make those visibility selectors at least as specific as the base figure/SVG display rule so both variants can never render at the same viewport width.

## Final Check

- The file exists under `./docs` and is a complete standalone HTML document.
- The original language is preserved.
- A reader without the conversation can follow the article from beginning to end.
- No remote runtime dependency or prose Markdown artifact remains.
- Code blocks preserve escaping, indentation, and static highlighting markup.
- Any spatial figure has passed rendered visual QA at desktop and mobile widths as required by `HTML-SVG-FLOW-DIAGRAMS.md`, or the delivery notes the verification limitation.
- The validator reports no issues.

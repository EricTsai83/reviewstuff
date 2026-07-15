---
name: to-html
description: Convert the current conversation context into a polished, independently readable knowledge article as a standalone HTML file saved under this project's docs folder.
disable-model-invocation: true
---

# To HTML

Turn the durable knowledge in the current context into an independently readable knowledge article delivered as a standalone `.html` file.

## Workflow

1. Extract explanations, examples, tradeoffs, caveats, code, commands, links, and next steps worth rereading. Omit tool logs, acknowledgements, and irrelevant back-and-forth.
2. Identify the background, terminology, system context, and connective explanations a new reader needs. Supply them in the article instead of relying on the conversation, repository, another document, or unstated prior knowledge.
3. Treat the conversation as source material, not as the outline. Organize the article around the subject and preserve the user's primary language unless asked otherwise.
4. If the article teaches or explains a subject, choose a useful learning path and article elements by following `Article Composition` below.
5. Choose the format:
   - Use a clean prose article by default.
   - Read `HTML-ARTICLE-DESIGN-PATTERNS.md` when a comparison, plan, report, code review, design sheet, diagram, table, or small interactive tool would communicate the material better.
   - Read `HTML-SVG-FLOW-DIAGRAMS.md` when a workflow, decision, state transition, boundary, or relationship needs a figure. Follow that reference for authoring, rendering, responsive behavior, and visual QA.
6. Write a complete standalone HTML document and save it under `./docs` from the project root. Create the folder if needed and use a concise topic filename such as `effect-cli-command-guide.html`.
7. After the first complete draft, read `IMPROVE-HTML-ARTICLE.md` and apply one revision pass directly to the file.
8. Read `DESIGN-SYSTEM.md` and apply it as the final visual-system pass unless the user requested a different design system or no design-system pass.
9. Run `bun .agents/skills/to-html/scripts/highlight-code-blocks.mjs <html-file>`.
10. Run `bun .agents/skills/to-html/scripts/validate-html.mjs <html-file>` and fix every reported issue.
11. Verify the final file, then report its relative path and a short summary. State any visual-QA limitation when figures could not be rendered and inspected.

## Independent Readability — Hard Requirement

Every generated HTML file must work as a self-contained knowledge-transfer article for a reader encountering the subject for the first time.

- Require no access to the source conversation, repository, earlier article, ticket, pull request, or undocumented team context.
- Introduce the subject, why it matters, essential terms, and the minimum background needed before presenting conclusions or advanced details.
- When the subject is codebase-specific, explain the relevant purpose, components, behavior, and constraints inside the article. Never assume the reader already knows what the code does.
- Make examples and excerpts understandable where they appear. State what they demonstrate and define unfamiliar identifiers or surrounding assumptions.
- Replace references such as “as discussed above,” “this code,” “our setup,” or “the previous implementation” when their meaning depends on information outside the article.
- Keep links and citations supplemental. The article's central explanation and reasoning must remain understandable without opening them.
- Prefer teaching the reusable idea, mental model, or decision method over merely recording a one-time implementation history.

If the available context cannot support an accurate independent explanation, research or inspect the necessary source material before writing. Do not publish an article that leaves required background implicit.

## Content Rules

- Write an article, not a transcript, Q&A log, or notes dump. Do not mention its conversational origin unless explicitly requested.
- Make knowledge transfer the primary purpose. The document must teach a coherent subject, not merely preserve what happened during a task.
- Center every section on durable knowledge. Remove material that only preserves thread history.
- Start with the `<h1>` topic title. Do not put an eyebrow/kicker, badge row, metadata strip, decorative label, or hero treatment above it, even when the default design-system pass is skipped.
- Keep technical articles prose-first; do not use marketing-style hero, split media/text, or decorative section-card layouts.
- Do not make the current repository or its code the subject, cite it, or infer content from it unless the user explicitly asks for that.
- For general learning articles, prefer small pedagogical examples over repository-specific code.
- Add outside context or research only when needed for accuracy or standalone completeness, and verify it before inclusion.
- Explain rationale, boundaries, and tradeoffs when they affect how the reader should understand or apply the subject.
- Do not add a TL;DR, “one thing to remember,” key-fact card, or summary callout by default. A short deck usually provides enough orientation; add a separate summary only when it contributes information the deck and conclusion do not already provide.

## Article Composition

Treat article structure as a palette, not a template or checklist. Select only the elements that help the specific subject, reader, and learning outcome. Do not include an element merely because it appears in this list, and do not force every article into the same sequence.

First identify the reader's likely starting point and what they should understand or be able to do afterward. Then compose the article from any useful combination of these elements:

| Element | What it can provide | Use it when |
| --- | --- | --- |
| Topic title | A direct statement of the article's subject | Always provide one semantic `<h1>` for the document |
| Short deck | Topic, relevance, scope, or expected outcome in one short paragraph | The title alone does not orient a first-time reader |
| Reading path or TOC | Links to major sections and a preview of the learning path | The article is long, has several distinct sections, or benefits from non-linear reading |
| Foundation section | Background, terminology, assumptions, or the problem being solved | Later material depends on concepts the reader may not know |
| Mental model | A reusable way to reason about the subject | The topic becomes easier when readers can predict behavior rather than memorize facts |
| Running or guided example | A concrete example that gains detail across sections | Continuity helps connect abstract ideas to behavior |
| Code block or command | Exact syntax, implementation, configuration, or observable behavior | The code itself materially advances understanding |
| Figure or diagram | Flow, state, hierarchy, boundary, ownership, or relationships | Spatial structure is harder to understand from prose alone |
| Table | Compact comparison, mapping, responsibility split, or decision criteria | Repeated fields or options are easier to scan side by side |
| Callout | A warning, caveat, exception, or unusually important constraint | The information needs emphasis at the point where it becomes relevant |
| Checklist or decision rules | Practical checks readers can apply independently | The article should support action or repeated decisions |
| Glossary | Short definitions for several domain terms | Terminology density would otherwise interrupt the main explanation |
| Closing synthesis or next exercise | A durable takeaway, application step, or way to test understanding | It adds value beyond repeating the introduction |
| Sources or references | Attribution and optional paths for deeper reading | The article relies on external research, standards, or documentation |

Use placement as guidance rather than a rigid order:

- Put a short deck directly after the title when one is useful. Do not repeat it with an automatic summary card.
- Put a reading path after the opening and before the main body when the article needs one.
- Introduce a concept before showing a figure, table, code block, or decision that depends on it.
- Give code and commands a purpose before the block and explain the important behavior afterward.
- Place diagrams after the prose that introduces the relationship and before detailed explanation that relies on the figure.
- Place callouts beside the relevant material, not automatically at the top of the article or at the end of every section.
- Keep sources near supported claims or in a concise reference section when the article uses outside material.

For educational content, order selected concepts by prerequisite. Foundation, mental model, guided example, mechanics, tradeoffs, application, and practical checks are possible stages, not mandatory sections. Merge fragmented questions into coherent concepts and add the connective explanation needed by someone who never saw the source conversation.

Before delivery, confirm that every included element earns its place, the headings express a coherent progression, and the article is understandable without the source conversation or access to the codebase.

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
- A first-time reader without the conversation, codebase, or other prior information can follow the article from beginning to end.
- The article supplies all essential background and functions primarily as knowledge transfer rather than task history.
- No remote runtime dependency or prose Markdown artifact remains.
- Code blocks preserve escaping, indentation, and static highlighting markup.
- Any spatial figure has passed rendered visual QA at desktop and mobile widths as required by `HTML-SVG-FLOW-DIAGRAMS.md`, or the delivery notes the verification limitation.
- The validator reports no issues.

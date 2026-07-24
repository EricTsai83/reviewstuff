---
name: to-html
description: Convert the current conversation or supplied context into a polished, independently readable knowledge article as a standalone HTML file saved under the project's documentation tree.
---

# To HTML

Create a self-contained HTML knowledge article from durable ideas in the current context. Preserve the user's primary language.

## Workflow

1. Identify the reader, the durable subject, and what the reader should understand afterward.
2. Extract useful explanations, examples, tradeoffs, caveats, code, links, and decisions. Omit conversation history, acknowledgements, tool logs, and one-time task details.
3. For an explanatory article, follow `General Design-Pattern Method` below.
4. Supply all background and terminology required by a reader who has not seen the conversation or repository.
5. Choose a clean prose article by default. Read:
   - `HTML-ARTICLE-DESIGN-PATTERNS.md` when a comparison, plan, report, code map, diagram, table, or small tool would communicate better.
   - `HTML-SVG-FLOW-DIAGRAMS.md` when a workflow, boundary, decision, state, or relationship needs a figure.
6. Select the destination using `Documentation Placement`, then write one complete standalone `.html` file.
7. After the first complete draft, read `IMPROVE-HTML-ARTICLE.md` and revise the file.
8. Read `DESIGN-SYSTEM.md` and apply it unless the user requested another visual system.
9. Run:

   ```sh
   bun .agents/skills/to-html/scripts/highlight-code-blocks.mjs <html-file>
   bun .agents/skills/to-html/scripts/validate-html.mjs <html-file>
   ```

10. Fix every validation issue and inspect the rendered page at desktop and mobile widths. Report the file path, a short summary, and any visual-QA limitation.

## General Design-Pattern Method

Use this method for articles that explain architecture, engineering choices, workflows, or best practices. Do not force it onto incident reports, code reviews, status reports, or other inherently specific documents.

1. **Find the reusable question.** Rewrite the immediate scenario as the broader problem a future reader will face.
2. **Teach the mental model first.** Explain responsibilities, boundaries, invariants, and information flow before repository-specific implementation details.
3. **Use one running example.** Let a concrete scenario make the pattern observable, but do not let an incidental feature become the article's subject.
4. **Show the mechanics.** Use focused code, a diagram, or a table only when it materially explains how the pattern works.
5. **State the best practice with scope.** Explain why it is the default, which tradeoffs it creates, and when an alternative is better.
6. **Return to the real codebase when useful.** Apply the general model to the current implementation as evidence or a worked example, not as unstated prerequisite knowledge.
7. **End with transferable decisions.** Give criteria, tests, or a concise synthesis the reader can reuse in another codebase.

A strong explanatory sequence is usually:

`practical problem → general model → implementation mechanics → alternatives and decision rules → codebase application`

Treat this as a reasoning order, not a mandatory section template. Prefer the smallest structure that teaches the subject clearly.

## Independent Readability

The article must stand alone:

- Introduce the subject, motivation, essential terms, and necessary system context.
- Treat the conversation as source material, not as the outline.
- Write an article, not a transcript, Q&A log, or notes dump.
- Prefer durable concepts and decision methods over implementation history.
- Explain every example where it appears; do not rely on inaccessible tickets, plans, or code.
- If repository-specific material is useful, briefly explain what the system does and why the excerpt matters.
- Verify external or repository facts needed for accuracy before writing.
- Keep citations supplemental; the central reasoning must remain understandable without opening them.

## Documentation Placement

1. Honor an explicit output path.
2. Otherwise inspect project guidance, the documentation root, its index, neighboring files, and classification rules.
3. Classify by the concept the reader intends to learn, not by incidental technologies or example names.
4. Prefer the deepest existing directory that clearly fits. Create a category only when the topic is reusable and no existing category fits.
5. Do not overwrite an unrelated file. Use best judgment unless multiple materially different destinations remain equally plausible.

## Content and Structure

- Start with one direct `<h1>` and, when useful, one short deck. Do not add an eyebrow, badge row, hero, or automatic TL;DR.
- Keep technical articles prose-first. Avoid marketing layouts and decorative section cards.
- Introduce concepts before code, tables, or figures that depend on them.
- Use one coherent running example instead of several disconnected examples.
- Include rationale, tradeoffs, exceptions, and decision criteria when they affect the recommendation.
- Use callouts only for a genuine warning, constraint, caveat, or exception.
- Do not add exercises or homework unless requested.
- Include only elements that directly teach, demonstrate, contrast, or support the article's subject.

## HTML Requirements

- Keep the document self-contained with semantic HTML, inline CSS, optional inline SVG, and only small local JavaScript.
- Do not use remote fonts, external images, CDNs, frameworks, runtime Mermaid, or browser-side syntax highlighting.
- Escape `&`, `<`, and `>` inside code. For highlighted blocks use exactly:

  ```html
  <pre><span class="label">TypeScript</span><code>...</code></pre>
  ```

- Prefer inline SVG over ASCII diagrams and follow `HTML-SVG-FLOW-DIAGRAMS.md`.
- If a figure has desktop and mobile variants, make them mutually exclusive with selectors at least as specific as the base SVG rule.

## Final Check

- The file is a complete standalone HTML document in the correct documentation subtree.
- A first-time reader can follow it without the conversation or repository.
- The title and article center the durable subject rather than an incidental example.
- Code, links, figures, tables, and claims are accurate and necessary.
- Code blocks preserve indentation, escaping, and static highlighting.
- The page has no remote runtime dependency or unintended horizontal overflow.
- Every figure is visually readable on desktop and mobile.
- The validator passes with no issues.

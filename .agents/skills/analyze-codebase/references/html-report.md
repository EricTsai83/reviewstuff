# Standalone HTML Report Requirements

Use these rules for every durable report produced by this skill.

## Document contract

- Produce one complete HTML5 document beginning with `<!doctype html>`.
- Set the document language, UTF-8 charset, responsive viewport, and a
  descriptive title.
- Keep the report independently readable when opened directly from disk.
- Include all essential CSS in a `<style>` block. Do not depend on CDNs,
  remote fonts, JavaScript frameworks, or network access.
- Use JavaScript only when it materially improves navigation or accessibility;
  the complete report must remain readable with scripts disabled.
- Put the report narrative in one `<main>` and use semantic `header`, `nav`,
  `section`, `aside`, `table`, `figure`, `code`, and `footer` elements where
  appropriate.

## Information design

- Lead with the system purpose, actors, scenario catalog, important
  limitations, and confidence boundary.
- Include a linked table of contents for all major sections.
- Use a compact visual hierarchy: restrained color palette, readable measure,
  clear heading levels, generous spacing, and consistent evidence styling.
- Render confidence labels and risk severity with both text and visual
  treatment. Never communicate meaning by color alone.
- Prefer tables for exact mappings, small inline SVG or CSS diagrams for
  topology and flow, and prose for interpretation.
- Do not use decorative dashboards, excessive cards, or charts that do not
  improve understanding.
- Keep code paths, symbols, commands, and schema values visually distinct with
  `<code>`.

## Evidence and links

- Link source citations to repository-relative paths with useful line
  fragments when the documentation host supports them.
- Show the path and symbol in the visible link text so the citation remains
  useful when opened directly from disk.
- Use unique, stable IDs for sections and internal links.
- Separate verified implementation facts, supported interpretations,
  inferences, unknowns, and recommendations.
- Record analyzed revision or date, validation performed, exclusions, and
  unresolved questions.

## Accessibility and responsive behavior

- Maintain logical heading order and one primary `<h1>`.
- Give navigation an accessible label.
- Add `<caption>` or nearby context to substantive tables, use header cells,
  and preserve readable row relationships.
- Add meaningful alternative text to informative images. Mark decorative
  visuals appropriately.
- Ensure keyboard-visible focus styles and adequate foreground/background
  contrast.
- Allow tables and long code/path values to scroll or wrap without widening
  the page.
- Verify the report at a desktop width and around 390 CSS pixels.

## Print behavior

- Add `@media print` rules that remove nonessential sticky navigation or
  decoration, preserve readable contrast, expand collapsible evidence when
  practical, and avoid clipping tables or code.
- Keep source links visible and meaningful in printed or PDF output.

## Validation checklist

Before delivery:

1. Open or render the file and inspect the top, representative tables, one
   detailed scenario, findings, and coverage sections.
2. Check desktop and narrow viewport layouts for overflow, clipped content,
   unreadable text, and broken navigation.
3. Verify the doctype, `lang`, charset, viewport, title, one `<main>`, one
   `<h1>`, unique IDs, internal fragment targets, and local asset paths.
4. Run repository-provided HTML validation or tests when available.
5. Run a diff/format check and confirm no unrelated files were overwritten.

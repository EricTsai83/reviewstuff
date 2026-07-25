# HTML Report Destination Rules

Use these rules before writing a durable system-design result. The files in
this skill are instructions only; place the generated HTML report in the target
repository's documentation tree.

## Contents

- [Choose the documentation root](#choose-the-documentation-root)
- [Choose the destination within the documentation root](#choose-the-destination-within-the-documentation-root)
- [Choose the report file](#choose-the-report-file)
- [Organize a large report](#organize-a-large-report)
- [Writing and maintenance rules](#writing-and-maintenance-rules)

## Choose the documentation root

1. Honor an explicit destination from the user.
2. Otherwise locate an existing documentation root such as `docs/`, `documentation/`, or a case variant.
3. Read its `README`, index, contribution guide, and nearby documents to learn taxonomy, format, naming, and linking conventions.
4. If no documentation root exists, create `docs/`.
5. Never create a second root such as `Docs/` when an equivalent root already exists.

## Choose the destination within the documentation root

Prefer an existing folder whose documented purpose matches code-coupled system design, in this order:

1. `system-design/` or an equivalent current-implementation area;
2. `architecture/` or `design/` when its stated purpose includes current system descriptions;
3. `reference/` when it explicitly owns implementation reference material;
4. the documentation root itself when no existing child is semantically suitable.

Do not place a current implementation analysis in tutorial, learning, proposal, plan, ADR, or historical folders merely because their names appear related.

When several folders could fit, follow their documented purpose rather than guessing from names. If none is clearly suitable, place the result directly under the documentation root instead of inventing a generic category.

## Choose the report file

Produce one standalone HTML file for focused, overview, and comprehensive
analysis. Do not split a report into Markdown files or a directory of scenario
pages unless the user explicitly requests a multi-file result.

Suggested path:

```text
docs/<matching-folder>/<system-name>-implementation-reference.html
```

Follow an existing HTML filename convention when one exists. Prefer
`*-implementation-reference.html` for a code-coupled current-system snapshot
and `*-system-design.html` only when the repository defines that suffix for
reusable design reasoning.

## Organize a large report

Make the single report independently useful:

- explain what the system enables users to accomplish;
- identify actors and their goals;
- provide a table of contents and scenario catalog with internal links;
- show the high-level runtime map;
- summarize key design decisions, risks, confidence, and coverage;
- keep detailed scenarios, architecture, domain/data, integrations/operations,
  and risks/coverage as top-level sections with stable IDs.

For many scenarios, use a compact catalog near the top and one `<section>` per
substantial scenario. Combine variants when they share the same goal and
implementation path. Give materially different authorization, state
transitions, consistency, or failure behavior separate subsections. Use
collapsible `<details>` only for secondary evidence or long reference material;
do not hide the primary narrative.

## Writing and maintenance rules

- Default to one standalone HTML file unless the user explicitly requests
  another format.
- Keep CSS in the document or reuse an existing repository-local stylesheet
  only when the report remains portable and the repository convention requires
  it. Do not require external CDNs, fonts, scripts, or network access.
- Use relative links for repository source evidence and internal fragment links
  for navigation.
- Cite repository source with paths, symbols, and useful line numbers according to local conventions.
- Prefer stable conceptual links over exhaustive file inventories.
- Update an existing document when it already covers the same system and purpose; do not create competing analyses without a reason.
- Preserve user-authored content and unrelated documentation.
- State the analyzed revision or date when the repository convention values implementation snapshots.

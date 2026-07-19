---
name: source-order-review
description: Review TypeScript source files and diffs for declaration order, public-contract visibility, private-declaration locality, schema/type grouping, and final-composition placement. Use when reviewing source-file organization, code ordering, or formatting guidelines in TypeScript or Effect modules; do not use for whitespace, Prettier formatting, directory structure, or general UI layout.
---

# Source Order Review

Review declaration organization without editing the code. Optimize for a predictable reading path, not mechanical grouping by syntax kind.

## Review Scope

Default to the current change set: declarations added, edited, or moved by the diff, plus ordering problems directly introduced by those changes. Read unchanged surrounding code only to understand context; do not report pre-existing issues outside the change set.

Expand the review only when the user explicitly names additional files, modules, commits, or a repository-wide scope.

## Workflow

1. Use the scope supplied by the user. If none is supplied, review the current uncommitted diff.
2. Read the applicable `AGENTS.md` and repository documentation before judging local conventions.
3. Inspect the complete diff, then read each changed TypeScript file in full. Inspect unchanged declarations and consumers only when needed to understand the changed code; this does not expand the review scope.
4. Read [references/rules.md](references/rules.md) completely before deciding findings.
5. Classify each file as an Effect service, use-case, renderer, command, composition root, or general module. Do not force a specialized template onto a different module kind.
6. Map the file's public contracts, private declarations, consumers, conceptual groups, main operations, and final composition. Base placement on consumer scope rather than `type`, `function`, `const`, or `export` syntax.
7. Apply the rules and exceptions. Treat repository-specific rules as authoritative when they conflict with the reference.
8. Report only qualifying findings. Do not edit files unless the user separately asks for a fix.

Text search may identify declarations and exports, but never treat a search match as a finding without tracing its consumers and conceptual group.

## Finding Threshold

Report a finding only when all are true:

- The issue is inside the user-provided scope. Without an explicit scope, it was introduced by the current diff and can be tied to a changed line or declaration.
- Its current position clearly hides the public contract, separates a private declaration from its consumers, breaks a meaningful declaration group, or places final composition before definitions it consumes.
- The preferred placement follows from actual consumer scope rather than personal taste.
- The expected move can be described precisely.
- The move preserves type safety, module boundaries, Effect requirements, error semantics, and resource lifecycle.

Do not report an alternative valid ordering, any pre-existing issue outside the review scope, or a deviation justified by the exceptions. Avoid speculative claims about readability; name the concrete declaration-consumer or concept relationship that is obscured.

## Scope Guardrails

- Review source organization, not whitespace, line wrapping, import sorting, naming, directory layout, or UI layout.
- Do not group every private type, helper, constant, or export merely because they share a syntax kind.
- Distinguish public contracts from exported final operations: a public type or service contract usually belongs near the top, while an exported use-case or renderer may be the final consumer at the bottom.
- Do not request a different `Layer` constructor, error channel, dependency mechanism, or runtime boundary merely to make files visually uniform. Those are semantic concerns outside this review.
- When a semantic issue is independently reviewable, do not disguise it as a source-order finding.

## Reporting

Write the review in Traditional Chinese. Keep identifiers, paths, APIs, and tags in their original form.

Lead with findings and order them by impact. Source-order findings are convention-level issues; do not inflate their severity above `P3` unless the same code has a separately established behavioral failure. For each finding include:

- `P3`
- the smallest useful file and line reference
- the obscured declaration-consumer or conceptual relationship
- the precise move or regrouping direction

Do not provide a summary before findings. If no finding qualifies, make the entire response exactly:

```text
沒有發現檔案組織問題
```

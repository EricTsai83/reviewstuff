---
name: effect-review
description: Review changed TypeScript for Effect service, Layer, dependency, runtime, resource-lifecycle, and typed-error correctness. Use when reviewing a diff, branch, commit, pull request, implementation, or refactor that creates, moves, constructs, provides, or consumes Effect services in this repository.
---

# Effect Review

Review Effect changes without editing them. Prioritize concrete runtime, dependency, lifecycle, error-channel, security, and migration problems over optional style preferences.

## Workflow

1. Establish the review target: uncommitted changes, a base branch, a commit, a PR checkout, or explicitly named files.
2. Read the applicable `AGENTS.md`, `package.json`, TypeScript config, and architecture documentation before judging conventions. Treat repository rules and the installed Effect version as authoritative.
3. Inspect the complete diff, then inspect directly affected service definitions, constructors, layers, composition roots, consumers, tests, and integration boundaries. Do not demand unrelated repository-wide cleanup.
4. Read [references/review-rules.md](references/review-rules.md) completely before deciding findings for an Effect service change.
5. Search the changed scope and affected call sites for suspicious patterns. Treat matches as leads, not automatic findings:

   ```bash
   rg -n 'ManagedRuntime\.make|runPromise|runPromiseExit|runSync|Layer\.(succeed|effect|scoped)|catchTag|catchTags|catchIf|Context\.Tag|Effect\.Service|Data\.TaggedError|Schema\.TaggedError' src test
   rg -n '\["Service"\]|ServiceShape|ServiceService|make[A-Z]|layer[A-Z]|\bLive\b' src test
   ```

6. Trace helper functions far enough to determine where dependencies and side effects actually come from. Verify whether each runtime call is a real application/test boundary, whether each injected value is a service or pure configuration, and whether each `Layer` constructor matches the resource lifecycle.
7. Check migrations mechanically: old paths, barrel exports, renamed service types, layer consumers, tests, and integration harnesses.
8. Run proportionate, non-mutating verification. Prefer the repository's typecheck, lint, and focused tests. Do not run a dev server or build unless the user explicitly asks or repository instructions require it.

## Finding Threshold

Report only a violation introduced or retained in the changed scope when all are true:

- The relevant code is changed or directly affected by the change.
- The failure mode or maintenance hazard is concrete.
- The expected fix can be stated precisely.
- The concern is not merely an alternative valid Effect style.

Do not report a pattern solely because `rg` found it. Explicit service values are valid in tests; `Layer.succeed` is valid for static implementations; runtime execution is valid at CLI and test boundaries; pure configuration and deliberate callback strategies are not service injection.

## Reporting

Write the entire review response in Traditional Chinese. Keep severity labels,
file paths, code identifiers, API names, and tags in their original form.

Lead with findings ordered by severity. For each finding include:

- severity
- the smallest useful file and line reference
- the concrete failure mode
- the expected fix direction

Use these levels:

- `P1`: likely security exposure, resource leak, duplicated owned runtime/resource, or broken dependency/lifecycle semantics.
- `P2`: incorrect typed-error behavior, hidden service dependency, incomplete migration, boundary violation, or behavior change without focused coverage.
- `P3`: enforceable local convention violation that creates a misleading or inconsistent public service API.

Do not emit a general summary before findings. If there are no qualifying findings, make the entire response exactly:

```text
沒有發現問題
```

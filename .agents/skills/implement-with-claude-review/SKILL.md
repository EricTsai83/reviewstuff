---
name: implement-with-claude-review
description: Implement a plan or scoped code change as Codex, verify it, ask Claude Code for a read-only review, then have Codex validate the findings, fix confirmed issues, rerun verification, and report the result. Use when the user provides a plan or specification and asks for implementation with Claude review, or requests an end-to-end Codex implementation and cross-model review workflow. If Claude quota is unavailable, fall back to an independent Codex review and clearly disclose it.
---

# Implement with Claude Review

Keep Codex responsible for implementation, final technical judgment, fixes, verification, and the user-facing result. Use Claude only as an independent read-only reviewer.

## Workflow

1. Read the user's plan or requirements, repository instructions, and current `git status`. Preserve unrelated user changes.
2. Implement the plan directly as Codex. Do not commit, push, deploy, or expand the scope unless the user requests it.
3. Run the most relevant available checks before review.
4. Ask Claude Code to review the implementation against the original plan, diff, changed files, and verification results. Keep Claude read-only.
5. Inspect every finding yourself. Accept only concrete correctness, regression, security, requirement, or meaningful test-coverage issues.
6. Fix accepted findings as Codex and rerun the affected checks. Reject false positives, style-only preferences, and speculative complexity.
7. If the fixes materially changed the implementation, run one final review with the same reviewer. Never exceed two review passes.
8. Give the user a concise implementation and review report with a complete per-file summary.

## Claude Review

Use Claude Opus by default unless the user requests another Claude model. Run Claude Code non-interactively in plan/read-only mode. Give it the original plan, implementation scope, relevant diff or changed files, pre-existing changes to ignore, and verification results.

A typical invocation is:

```bash
claude -p \
  --model opus \
  --permission-mode plan \
  --tools "Read,Grep,Glob,Bash" \
  "<focused review prompt>"
```

Tell Claude not to edit files. Ask it to prioritize findings over summary and include severity, file and line, concrete failure mode, and suggested fix direction. Ignore formatting, naming, subjective style, and unrelated future improvements.

Treat Claude's review as evidence, not authority. Codex must verify each finding before changing code.

## Quota Fallback

If Claude clearly fails because of quota, credits, usage limits, rate limits, or billing limits, use an independent Codex review instead:

```bash
codex -C "$PWD" review -
```

Pass a focused review prompt through stdin with the original plan, acceptance criteria, implementation scope, verification results, and pre-existing changes to ignore.

Immediately tell the user:

```text
Review provider: Codex (fallback — Claude quota insufficient)
```

After fallback, use Codex for any remaining review pass in that task. Count fallback reviews toward the two-pass limit. State that the review was independent but not cross-model.

Do not label authentication, organization-policy, context-size, or invalid-input errors as quota failures. Report those errors directly. If the Codex fallback also fails, report both failures and stop the review workflow.

## Final Report

Include:

- an overall summary of the behavior changed and why;
- review provider for each pass;
- substantive findings and whether Codex accepted or rejected them;
- fixes made after review;
- verification commands and results;
- remaining risks or incomplete review steps.

Add a `Changed Files` section covering every file added, modified, deleted, or renamed by this task. List each path separately and explain:

- `What changed`: the concrete code, behavior, documentation, configuration, or test change;
- `Why`: the requirement, finding, or architectural reason for that change.

Derive this list from the task's starting `git status` and final diff so unrelated pre-existing user changes are not attributed to the implementation. Do not omit small support files, tests, configuration, deletions, or review-driven follow-up changes.

A compact entry should look like:

```text
- path/to/file.ts
  - What changed: ...
  - Why: ...
```

If Claude completed review, say so. If quota fallback occurred, use the exact provider label above and never imply Claude approved the implementation.

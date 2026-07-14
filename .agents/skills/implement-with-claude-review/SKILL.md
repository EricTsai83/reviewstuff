---
name: implement-with-claude-review
description: Implement a plan or scoped change, verify it, obtain a read-only Claude review, validate and fix confirmed findings, then report in Traditional Chinese with a per-file summary. Use for end-to-end implementation requests that require Claude or cross-model review. Fall back to an independent Codex review when Claude is unavailable and disclose the reason.
---

# Implement with Claude Review

Codex owns implementation, final technical judgment, fixes, verification, and reporting. Claude is a read-only reviewer.

## Workflow

1. Read the requirements, repository instructions, and starting `git status`; preserve unrelated changes.
2. Implement without committing, pushing, deploying, or expanding scope unless requested.
3. Run proportionate checks.
4. Request a read-only Claude review against the requirements, diff, and check results.
5. Validate every finding; accept only concrete correctness, regression, security, requirement, or meaningful test-coverage issues.
6. Fix accepted findings and rerun affected checks. Reject style-only, speculative, or false-positive findings.
7. If fixes are material, run one final pass with the same reviewer. Maximum: two review passes.
8. Report the result in Traditional Chinese using the format below.

## Claude Review

Use Claude Opus unless the user requests another model. Run non-interactively in plan/read-only mode:

A typical invocation is:

```bash
claude -p "<focused review prompt>" \
  --model opus \
  --permission-mode plan \
  --tools "Read,Grep,Glob,Bash"
```

Include the requirements, implementation scope, changed files or diff, checks, and pre-existing changes to ignore. Require severity, file/line, failure mode, and fix direction. Exclude formatting, naming, subjective style, and unrelated improvements. Treat findings as evidence, not authority.

## Claude Failure Fallback

If Claude returns no usable review—because of access, quota, policy, authentication, timeout, tooling, context, or malformed output—retry once only when the invocation is clearly correctable; otherwise use independent Codex review:

```bash
codex -C "$PWD" review -
```

Pass the same review context through stdin. Immediately identify the fallback with the specific, sanitized reason:

```text
Review provider: Codex (fallback — Claude unavailable: <specific reason>)
```

After fallback, use Codex for remaining passes and count them toward the two-pass limit. State that the review was independent, not cross-model, and never imply Claude approved it. If fallback also fails, report both failures and stop review work.

## Final Report

Write explanations and headings in Traditional Chinese; preserve commands, identifiers, paths, model names, and required provider labels. Lead with outcomes, not chronology. Use exactly these sections:

```markdown
## 實作結果

- 2–4 點使用者可見行為與重要架構結果。

## 檔案摘要

| 檔案 | 狀態 | 變更摘要 | 目的／影響 |
| --- | --- | --- | --- |
| `path/to/file.ts` | 新增／修改／刪除／重新命名 | 具體變更 | 需求、架構原因或使用者影響 |

## Review 結果

- 每一 pass 的 provider、finding、接受／拒絕與對應修正。

## 驗證

- `command`：結果與重要計數。

## 剩餘風險

- 只列具體風險或未完成步驟；沒有則明確說明。
```

Build `檔案摘要` from starting status and final diff. Include every task-owned source, test, support, config, documentation, deletion, rename, and review fix; exclude pre-existing user changes. List each path once, keep cells concise, and do not repeat separate `What changed` / `Why` lists.

State whether Claude completed review. For fallback, repeat the exact provider label and reason, and never imply Claude approved the work.

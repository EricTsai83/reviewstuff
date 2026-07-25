---
name: implement-with-claude-review
description: Implement a plan or scoped change, verify it, obtain a read-only Claude review, validate and fix confirmed findings, then report in Traditional Chinese with a detailed, concrete per-file summary. Use for end-to-end implementation requests that require Claude or cross-model review. Fall back to an independent Codex review when Claude is unavailable and disclose the reason.
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

### `path/to/file.ts` — 新增／修改／刪除／重新命名

- **具體變更**：指出變更的元件、函式、型別、schema、route、設定鍵或測試案例，以及各自改了什麼。
- **行為與資料流**：說明重要條件、狀態轉換、輸入輸出、錯誤處理或呼叫鏈的前後差異；不適用時省略。
- **目的與影響**：連結到對應需求，並指出使用者行為、公開介面或下游模組受到的影響。
- **驗證重點**：列出這個檔案所涵蓋或新增的成功、失敗與邊界案例；若只由整體檢查涵蓋，指出對應命令。

## Review 結果

- 每一 pass 的 provider、finding、接受／拒絕與對應修正。

## 驗證

- `command`：結果與重要計數。

## 剩餘風險

- 只列具體風險或未完成步驟；沒有則明確說明。
```

Build `檔案摘要` from starting status and final diff. Include every task-owned source, test, support, config, documentation, deletion, rename, and review fix; exclude pre-existing user changes. Create one subsection per path and list each path exactly once.

Make every entry concrete enough that the user can understand the implementation without opening the diff:

- Name the important symbols, UI regions, endpoints, data fields, configuration keys, or test scenarios changed in that file.
- Describe meaningful before/after behavior, including branching, fallback, validation, state, persistence, side effects, and error handling when relevant.
- For tests, name the exact behavior and edge cases covered and the expected outcome; do not merely say that tests were added.
- For configuration, migrations, generated support files, and documentation, identify the exact entries or sections changed and their runtime or developer-facing effect.
- For deletions, explain which responsibility was removed and where it moved or why it is no longer needed. For renames, show `old/path → new/path` and state whether content also changed.
- Identify changes originating from accepted review findings in the affected file entry.

Avoid vague summaries such as “更新邏輯”, “改善型別”, “重構元件”, “補上測試”, or “調整設定”. Prefer 2–5 information-dense bullets per file, expanding when a file contains multiple independent changes. Do not paste the diff or narrate trivial line-by-line edits.

State whether Claude completed review. For fallback, repeat the exact provider label and reason, and never imply Claude approved the work.

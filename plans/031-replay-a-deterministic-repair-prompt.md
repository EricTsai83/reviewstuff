# 031 — Replay a deterministic repair prompt

[← Plan index](./README.md)

**Depends on:** 030。 **Learning:** reproducible derived artifacts。

**Working state:** `reviewstuff review prompts --finding <id> [--session <id>]` 從 stored redacted request + finding 產生
固定 prompt，不呼叫模型。

**In:** versioned pure prompt builder、prompt hash、human/JSON output。 **Out:** saving full prompts、current-worktree context、
fix engine、自動執行 prompt。

**Steps:** 定義最小 repair prompt schema；只引用 session snapshot；stable field ordering/escaping；fixture snapshot與 hash。

**Accept:** zero engine calls/writes；後續工作樹改動不改 replay；找不到所需 stored context時明確拒絕；output標示
redacted/session來源。


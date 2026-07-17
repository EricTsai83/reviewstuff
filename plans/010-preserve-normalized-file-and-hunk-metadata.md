# 010 — Preserve normalized file and hunk metadata

[← Plan index](./README.md)

**Depends on:** 009。 **Learning:** Git data contract before product policy。

**Working state:** Git layer回傳所有 scope files與可獨立選取的 complete hunk metadata；oversized file不再因沒有
patch text就從 changed-file identity消失。

**In:** normalized file/change/hunk contract、binary identity、original line counts、strict unified-diff parsing。
**Out:** budget estimation、selection、report rendering、provider request。

**Steps:** characterization 現有 large-file behavior；定義 Git-owned normalized result；strict parser保留完整 hunk；
binary/oversized仍回 file metadata；malformed/truncated Git output all-or-nothing failure。

**Accept:** changed file不因沒有 text patch消失；每個 hunk都完整；Git layer不做 AI budget policy；CommandRunner output
cap仍是 fatal typed failure。


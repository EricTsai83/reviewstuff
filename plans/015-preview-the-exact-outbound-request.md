# 015 — Preview the exact outbound request

[← Plan index](./README.md)

**Depends on:** 014。 **Learning:** dry-run boundary and user consent。

**Working state:** `reviewstuff review --dry-run-request --json` 顯示 redaction 後、budget 後的 exact normalized
request，不呼叫 engine、不建立 session。

**In:** preview use-case/result、human/JSON renderer、exit policy。 **Out:** provider payload serialization、storage、
interactive confirmation。

**Steps:** 在 engine invocation 前分支；重用同一 builder/budget/redaction pipeline；加 spy engine 與
filesystem fake；文件標示 estimate 與實際 provider envelope 的界線。

**Accept:** zero engine calls、zero writes；preview 與隨後 engine 收到的 normalized request相同；machine
stdout 只有一份 JSON document。


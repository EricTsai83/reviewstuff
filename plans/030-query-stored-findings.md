# 030 — Query stored findings

[← Plan index](./README.md)

**Depends on:** 029。 **Learning:** read-only application query。

**Working state:** `reviewstuff session findings [--session <id>] [--severity <value>] --json` 從 latest/指定
session 讀取。

**命名決策：** storage 相關的 read-only command 全部放在 `session` namespace，不掛在 `review` 之下。
`reviewstuff review findings` 讀起來像「去 review 那些 findings」，而且 `review` 本身是有 handler 的
動作 command，日後加 positional argument 會與 subcommand 名稱衝突。031 的 prompt 也用同一 namespace。

**In:** `session` command namespace、query use-case、severity filter、human/JSON result、missing/corrupt
session errors。 **Out:** status mutation、stats、prompt replay、provider calls。

**Steps:** 建立 `session` parent command 與 `findings` subcommand；query 只依賴 StorageService；pure
filtering/stable ordering；fixture e2e。

**Accept:** zero engine calls/writes；unknown finding/session 有清楚 error；JSON schema versioned；不建立
top-level alias 或 `review` 下的重複入口。

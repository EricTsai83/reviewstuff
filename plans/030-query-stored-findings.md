# 030 — Query stored findings

[← Plan index](./README.md)

**Depends on:** 029。 **Learning:** read-only application query。

**Working state:** `reviewstuff review findings [--session <id>] [--severity <value>] --json` 從 latest/指定 session讀取。

**In:** query use-case、severity filter、human/JSON result、missing/corrupt session errors。 **Out:** status mutation、stats、
prompt replay、provider calls。

**Steps:** command namespace下建立 canonical subcommand；query只依賴 StorageService；pure filtering/stable ordering；
fixture e2e。

**Accept:** zero engine calls/writes；unknown finding/session有清楚 error；JSON schema versioned；不建立重複 top-level alias。


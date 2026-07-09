# 012 - Doctor And Supportability

## Goal

提供本機診斷，讓使用者知道 ReviewStuff 是否能正常 review。

## Working State

完成後可用：

```bash
reviewstuff doctor
reviewstuff doctor --json
```

## Scope

包含：

- runtime/binary checks
- git checks
- storage checks
- provider checks
- config checks
- language/tool availability summary

不包含：

- telemetry
- remote log upload

## Implementation Steps

1. 定義 `DoctorReportV1`。
2. 每個 check 有 id、status、message、remediation。
3. AI credentials 缺失不阻止 doctor 執行。
4. JSON output 給 CI/agent 使用。

## Verification

```bash
./dist/reviewstuff doctor
./dist/reviewstuff doctor --json | jq .
```

測試場景：

```text
inside git repo
outside git repo
missing credentials
missing optional tools
```

## Acceptance Criteria

- pass/warn/fail 區分清楚。
- doctor 不要求 AI credentials。
- JSON schema 穩定。


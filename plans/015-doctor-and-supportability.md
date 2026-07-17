# 015 - Doctor And Supportability

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
- current install provenance checks：dev/local/unknown，schema 預留後續 channel contribution
- non-billable provider endpoint/config reachability when available
- data/privacy status summary

不包含：

- analyzer/language tool checks
- telemetry
- remote log upload
- full analyzer matrix checks

## Implementation Steps

1. 定義 `DoctorReportV1`。
2. 每個 semantic service 提供 typed health contribution；doctor use-case 聚合 checks，
   每個 check 有 id、status、message、remediation，不直接取得 filesystem、network、
   `CommandRunner` 或 provider SDK。
3. AI credentials 缺失不阻止 doctor 執行。
4. doctor 只回報此時可可靠辨識的 dev build、local executable/symlink、unknown；npm、Homebrew、
   direct tarball 由 020/021/033 在各通道真的存在時再貢獻，避免提前寫猜測式 detector。
5. update capability 在 033 前明確回 `not_available`，不連線檢查尚不存在的 manifest。
6. provider endpoint/config reachability 只在 credentials 存在且 provider 有明確 non-billable
   health endpoint 時檢查；`doctor` 預設不得發出模型 inference。需要付費/推論的 live smoke
   必須是明確 opt-in，並標示可能成本。
7. doctor 顯示目前 provider/model 會不會把資料送到 cloud；029 完成前至少給 warning/remediation。
8. JSON output 給 CI/agent 使用。

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
provider endpoint unavailable
cloud provider configured without privacy policy docs
```

## Acceptance Criteria

- pass/warn/fail 區分清楚。
- doctor 不要求 AI credentials。
- JSON schema 穩定。
- warnings 不造成 non-zero exit；fail 才 exit 1。
- provider/network checks 有 timeout，不會卡住 doctor。
- doctor 預設不發出 billable model request，也不因 health check 傳送 repo content。
- 尚未實作的 install/update channel 顯示 `not_available`，不以猜測路徑誤判或發 network request。
- doctor 可以讓使用者知道 review request 會走 local provider 還是 cloud provider。
- doctor command 只 render `DoctorReportV1`；環境檢查位於對應 concrete implementation。

## Learning Focus

- supportability checks 的資料模型。
- 將環境問題轉成可行的 remediation message。

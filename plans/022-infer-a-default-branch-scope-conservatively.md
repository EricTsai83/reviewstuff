# 022 — Infer a default branch scope conservatively

[← Plan index](./README.md)

**Depends on:** 021。 **Learning:** safe defaults under incomplete repository metadata。

**設計決策：預設行為不變。** `reviewstuff review` 沒有任何 scope flag 時仍只 review uncommitted。
branch base 的推斷是 opt-in：`--base auto` 或 config `review.base`。理由：把預設從 uncommitted 擴大到
「branch changes + uncommitted」會讓長 feature branch 上的一次 cloud review 靜默送出更多資料與費用，
違反前面 milestone 建立的「送出的資料可預期」原則；`refs/remotes/origin/HEAD` 也只在 clone 時
設定，經常 stale。

**Working state:** `--base auto` 或 `review.base: auto` 時，若 remote symbolic HEAD 可可靠解析就以它為
merge-base 的 base，scope 記錄 `baseOrigin: "inferred-remote-head"`；`review.base: <ref>` 則等同
`--base <ref>` 且 `baseOrigin: "config"`。無法解析時以 typed error 失敗並給出 remediation
（改用 `--base <ref>` 或移除 config），不退回其他 scope。

**Precedence：** explicit `--from`/`--base <ref>` > `--base auto` > config `review.base`。

**In:** `review.base` config 欄位（同步更新 048 的 provenance source coverage 與 fixtures）、remote
symbolic HEAD discovery（`symbolic-ref refs/remotes/origin/HEAD`，不連網）、typed unresolvable error、
detached/unborn behavior、`baseOrigin` 進 report。
**Out:** network fetch、guessing `main`/`master`、以 feature branch 的 upstream 當 semantic base、
改變無 flag 時的預設、schema 變更。

**Steps:** pure decision table；Git metadata operations；fixtures：no remote、stale/missing symbolic HEAD、
feature branch 有 upstream 但 origin/HEAD 缺席、detached HEAD；report 顯示 base 來源。

**Accept:** 無 flag 時行為與 021 完全相同；不將 feature upstream 誤認 default branch；不連網；
無法推斷時 fail fast 且訊息可行動；explicit flags 永遠勝過 config；`config show` 顯示 `review.base`
與其來源。

# 008 — Extract the fake review engine

[← Plan index](./README.md)

**Depends on:** 007。 **Learning:** Effect semantic service boundary。

**Working state:** `runReview` 不再知道 fake marker rule；唯一 production engine 是 deterministic fake。

**In:** `ReviewEngine` contract、typed errors、fake canonical implementation/layer、use-case fake layer。
**Out:** provider registry、cloud/local adapters、retry、prompt building。

**Steps:** 定義最小 `review(request)` contract；移動 deterministic logic；由 App layer 提供 fake engine；
將 timeout 留在 use-case 或明確 engine boundary，只保留一個 owner。

**Accept:** `runReview` dependency 只有 semantic services；fake engine deterministic；engine failure 有 typed
CLI mapping；沒有空 provider skeleton。


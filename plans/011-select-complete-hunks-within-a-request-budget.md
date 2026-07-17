# 011 — Select complete hunks within a request budget

[← Plan index](./README.md)

**Depends on:** 010。 **Learning:** deterministic budget policy。

**Working state:** pure selector以 conservative estimate、fixed request overhead與 output reserve，round-robin選取可容納的
complete hunks。

**In:** estimator contract、whole-hunk selection、stable ordering、`reviewed|truncated|skipped` coverage schema。
**Out:** use-case/renderer integration、provider tokenizer SDK、多批 calls、semantic ranking。

**Steps:** current/edge schema fixtures；實作不低估 UTF-8/JSON escaping 的 fallback estimate；round-robin selector；
starvation、first-hunk-too-large、zero-budget fixtures。

**Accept:** 不切半個 hunk；same input/policy產生 same output；大型首檔不餓死後續小 hunk；selector無 IO/provider/Git依賴。


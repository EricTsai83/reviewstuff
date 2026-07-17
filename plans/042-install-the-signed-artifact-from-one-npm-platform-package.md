# 042 — Install the signed artifact from one npm platform package

[← Plan index](./README.md)

**Depends on:** 041。 **Learning:** npm meta + optional platform package pattern。

**Working state:** local packed `reviewstuff` + `@reviewstuff/darwin-arm64` 在 temporary project安裝並執行同一 signed binary。

**In:** exact-version optional dependency、`os`/`cpu` metadata、allowlisted wrapper、isolated pack/install test、doctor contribution。
**Out:** npm publish、install-time download/build、Linux/x64 packages、self-update。

**Steps:** package只含 wrapper/對應 binary；wrapper只解析固定 package name；使用 repo既有 Bun package manager測 local tarballs；
驗 tar contents/mode/checksum/version。

**Accept:** no install scripts/network download；unsupported platform有清楚 error；不改 global package state；npm與release manifest bytes
一致。


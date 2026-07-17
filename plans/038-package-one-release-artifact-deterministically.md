# 038 — Package one release artifact deterministically

[← Plan index](./README.md)

**Depends on:** 037。 **Learning:** artifact identity and provenance。

**Working state:** local/CI可產生單一 `darwin-arm64` tarball、`SHA256SUMS`、versioned manifest與 build provenance。

**In:** package script、fixed tar layout/order/mode/mtime、artifact checksum/size/target、source commit/toolchain metadata。
**Out:** signing、notarization、Homebrew/npm、multi-platform matrix、manifest signature。

**Steps:** 定義 `ReleaseManifestV1`；package existing standalone binary；round-trip extract/verify；量測 reproducibility，若 Bun
binary不 bit-for-bit deterministic只記錄 provenance，不虛假宣稱 reproducible。

**Accept:** manifest逐一匹配 bytes；archive只有預期 executable/docs；checksum只宣稱 integrity、不宣稱 authenticity；wrong
version/target拒絕。


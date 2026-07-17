# 026 — Add one fast review policy

[← Plan index](./README.md)

**Depends on:** 025。 **Learning:** policy preset without branching architecture。

**Working state:** `--fast` 與兼容 alias `--light` 解析成同一個較小 request budget；其餘 pipeline 不分叉。

**In:** profile override、effective budget metadata、alias conflict handling。 **Out:** cheaper model auto-selection、
tool depth、provider pricing、deep review。

**Steps:** 在 config resolution 建立單一 `fast` policy；兩個 flags 映射同一 override；budget tests 比較 standard/
fast；renderer 顯示 effective policy。

**Accept:** aliases 完全等價；fast 的 request budget 可觀察且更小；不偷偷換 provider/model；仍遵守 redaction/
privacy/coverage。


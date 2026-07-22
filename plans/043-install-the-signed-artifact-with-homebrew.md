# 043 — Install the signed artifact with Homebrew

[← Plan index](./README.md)

**Depends on:** 042。 **Learning:** one installation channel consuming canonical bytes。

**Working state:** test-only tap formula下載 042 的 exact signed tarball/checksum，安裝後可執行 version與 fake/no-change smoke。

**In:** formula、checksum pin、unique temporary tap harness、audit/test/cleanup、doctor channel contribution。
**Out:** automatic tap publication、source build、multi-arch formula、self-update。

**Steps:** formula不 rebuild；test harness用 fixture/local release或 draft URL；finally清理唯一 tap；production formula update需 manual
review且指向 immutable release URL。

**Accept:** 不碰使用者既有 tap/formula；formula bytes與 manifest相同；install smoke無 credentials；doctor不靠猜 path而由 installed
wrapper/contribution辨識 Homebrew。


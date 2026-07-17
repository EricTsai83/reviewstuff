# 009 — Build a pure review request

[← Plan index](./README.md)

**Depends on:** 008。 **Learning:** pure prompt/request construction。

**Working state:** Git diff、config 與 repo metadata 可被純函式轉成 versioned `ReviewRequestV1`，fake engine
也走同一 contract。

**In:** `review/` pure module、system instructions、normalized file/diff envelope、request schema fixture。
**Out:** token clipping、redaction、network、provider formatting、analyzers。

**Steps:** 定義 request schema；把 prompt text 與 structured context 分開；加入 special filename/control
character fixtures；將 use-case 改為先 build request 再呼叫 engine。

**Accept:** builder 不依賴 IO/runtime/provider；相同輸入產生相同 request；repo content 明確標成 untrusted
data；fake 行為不回歸。


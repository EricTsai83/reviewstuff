# 038 — Polish the human review report

[← Plan index](./README.md)

**Depends on:** 037。 **Learning:** human-first rendering without breaking machine contracts。

**Working state:** terminal report 依 severity → file → line deterministic 排序並按檔案分組；request
budget 細節只在 coverage 不完整或 `--verbose` 時顯示；`--json` 與 NDJSON contract byte-for-byte 不變。

**In:** deterministic finding ordering、file grouping、conditional budget rendering、`--verbose` flag、
no-findings/no-change/incomplete-coverage 訊息的一致措辭。 **Out:** 顏色與 TTY styling、interactive
TUI、markdown/SARIF output formats、finding message 內容改寫、exit-code 行為（032 已定案）。

**Steps:** sort/group 是 renderer 內的 pure functions 並先建 fixtures；`--verbose` 只影響 human path；
更新 renderer snapshot tests；用既有 report fixtures 驗證 machine outputs 不變；compiled binary e2e。

**Accept:** 相同 report 產生 byte-identical human output；同 severity 內以 file/line 排序、順序穩定；
coverage 不完整時 budget 資訊永遠可見，完整時預設隱藏；`--json`、NDJSON 與 session 內容完全不受
影響；docs plans（045–046）可直接以此輸出截圖/範例。

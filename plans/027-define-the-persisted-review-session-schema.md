# 027 — Define the persisted review session schema

[← Plan index](./README.md)

**Depends on:** 026。 **Learning:** durable schema design before filesystem code。

**Working state:** `ReviewSessionV1` fixtures能表示 effective scope/policy、redacted normalized request、coverage、
engine metadata 與 findings，但尚未寫入 disk。

**In:** session/finding/request references、session ID rules、created-at injection、current/previous fixture policy。
**Out:** filesystem layout、latest lookup、raw pre-redaction diff/prompt、fix attempts。

**Steps:** 從實際 output contract設計 schema；只保存 014 redaction 後的 request；用 fake Clock/ID 產生 deterministic fixture；
定義 corrupt/unsupported version errors。

**Accept:** schema 不含 credentials/raw provider body；同一 finding schema不被複製成第二套；decode all-or-nothing；
future fix/analyzer欄位不先預留空殼。


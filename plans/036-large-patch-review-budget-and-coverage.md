# 036 - Large Patch Review Budget And Coverage

## Goal

在既有 file filters、skip reporting 與 provider input guardrail 之上，將大型文字 diff
從「超過逐檔大小上限就整份略過」改成可預測的 budgeted selection，盡可能保留完整
diff hunks，並讓使用者清楚知道哪些內容已 review、被截斷或被略過。

## Working State

完成後，大型 TypeScript 或其他文字原始碼不會只因單一檔案的 patch bytes 超限而靜默
消失。Human、JSON、agent 與 session output 都會回報 review coverage；provider request
只包含預算內的完整 hunks。

## Scope

包含：

- serialized provider request 的總 input token/size budget、獨立 output reserve 與 deterministic
  fallback estimate
- `clip | skip` large-patch policy，預設使用 `clip`
- 只在 hunk boundary 截斷，不產生不完整 diff hunk
- stable file ordering 與 deterministic hunk selection
- `reviewed | truncated | skipped` file coverage 與 stable reason codes
- changed/reviewed/truncated/skipped file、hunk 與 line counts
- human、JSON、agent event、session metadata 的 coverage 輸出
- command output safety limit 與 review input budget 的責任分離
- config/profile override 與有效 budget/policy 的 request metadata

不包含：

- 將單次 review 拆成多次 provider calls
- cross-batch finding merge 或 deduplication
- semantic ranking、embedding 或 LSP-based relevance selection
- generated/vendor/binary/lock-file policy；沿用 023 的 selection 結果
- provider retry、cost accounting 或 model-specific pricing；沿用 028
- 為了塞進預算而改寫、摘要或壓縮 source code

## Design Decisions

### Two Different Limits

- `CommandRunner` output limit 是 subprocess resource-safety guardrail。超限必須終止 command
  並回報 typed error，不能被當成正常的 file skip policy。
- review input budget 是 pure selection policy。它接收 Git 已正規化的檔案與 hunks，輸出
  provider request 和 coverage，不直接執行 Git 或 provider command。

兩者不可共用同一個常數或錯誤語意。低階 command cap 可以使用 bytes；review budget
必須先扣除 system prompt、schema、metadata、file context 等 fixed request overhead，並保留
output budget。優先使用與 effective provider/model 相符的 tokenizer；無 tokenizer 時使用經
fixture 驗證、不低估 UTF-8/JSON escaping 的保守 deterministic upper-bound estimate。不能只算
diff 然後宣稱整個 serialized request 沒超限。

### Selection Policy

1. 保留 023 已判定 included 的文字檔 metadata，即使其所有 hunks 最後都不在預算內。
2. 使用 stable path ordering 與 deterministic round-robin hunk selection；同一檔案內維持
   原始 hunk order，避免第一個大檔耗盡預算而永久餓死後續小檔。
3. hunk 能完整放入剩餘預算時才納入，不從 hunk 中間切斷；放不下的 hunk 要記錄 omitted
   reason，並繼續考慮其他檔案可完整容納的 hunk。
4. 第一個 hunk 就超出剩餘預算時，將檔案標記為 `truncated`，並記錄明確 reason；即使零個
   hunk 入選仍保留 coverage metadata。
5. `skip` policy 才允許整份大型 patch 不進 request；binary/generated 等仍由 023 處理。
6. selection 必須 deterministic：相同 diff、config 與 tokenizer estimate 產生相同 request。

### Coverage Contract

新增 versioned coverage schema，例如 `ReviewCoverageV1`，至少包含：

- changed、included、reviewed、truncated、skipped file counts；`included` 由 reviewed 與
  truncated 組成，不是另一種互斥狀態
- reviewed 與 omitted hunk/changed-line counts
- 每個檔案的 status、reason、original/selected estimates
- effective input budget 與 large-patch policy

`changedFiles` 一律代表實際 Git scope 內的總變更檔案數，不能只計算送進 provider 的檔案。
沒有完整 coverage 的 review 不得顯示為 full review。

## Ownership

- `git/`：提供完整、正規化的 file/hunk metadata；辨識 binary，但不決定 AI review 預算。
- `review/`：實作 pure budget estimator、hunk selection 與 coverage calculation。
- `use-cases/`：編排 Git selection、budget policy、engine request 與 report metadata。
- `engines/`：只接收已正規化且在預算內的 request，不自行靜默截斷。
- `domain/` / `output/`：擁有 versioned coverage model 與各輸出格式的呈現。

## Implementation Steps

1. 為目前大型 patch 行為補 characterization tests，涵蓋靜默略過與 `changedFiles` 誤差。
2. 定義 `ReviewCoverageV1`、file coverage status 與 stable reason codes。
3. 讓 Git diff result 保留 scope 內所有檔案 metadata，不以缺少 patch 代表檔案不存在。
4. 在 `review/` 新增 pure budget estimator 與 whole-hunk selection policy。
   estimator 輸入包含 fixed request envelope 與 output reserve，selector 不得自行猜 model limit。
5. 將預設 large-patch policy 設為 `clip`，並保留明確的 `skip` override。
6. 讓 request metadata、report、session、JSON 與 agent events 共用同一份 coverage。
7. 更新 human renderer，顯示簡短 coverage summary 與 truncated/skipped reasons。
8. 加入 boundary tests，確認 `git/`、`review/`、`engines/` 不互相偷做對方的 policy。
9. 補文件說明 resource-safety output cap 與 provider review budget 的差異。

## Verification

```bash
bun run typecheck
bun run test
bun run build
./dist/reviewstuff review --engine fake --json
```

Fixture tests 至少覆蓋：

- 單一大型文字檔可保留部分完整 hunks，並標記 `truncated`
- 多個小檔案超過總預算時，selection 與 coverage deterministic
- path-order starvation fixture：大型首檔不會阻止後續可容納小 hunk 被 review
- UTF-8、JSON escaping、fixed prompt/schema/context overhead 與 output reserve 都納入 budget
- binary/generated/lock file 維持 023 的 skip reason
- `skip` policy 會明確回報，而不是靜默消失
- `changedFiles = reviewed + truncated + skipped` 的 file-level 分類不重複且不遺漏
- command output cap 超限是 typed failure，不會偽裝成正常 coverage
- human、JSON、agent、session 的 coverage 數值一致

## Acceptance Criteria

- 大型文字 patch 預設不再因固定逐檔 bytes threshold 被整份靜默略過。
- 完整 serialized provider request 永遠不超過 effective input/context budget，且保留設定的
  output reserve。
- 截斷只發生在完整 hunk boundary，結果 deterministic。
- 所有 scope 內檔案都出現在 coverage，並具有 stable status/reason。
- `changedFiles` 表示 Git scope 總數，不再只表示成功取得 patch 的檔案。
- engine 不做第二層未回報的 truncation。
- 既有 binary/generated/vendor/lock-file defaults 不被放寬。
- 未新增多次 provider call；若單次 request 仍不足，輸出 actionable coverage warning。

## Follow-Up Trigger

只有在 dogfood/session metadata 顯示經常有高價值 hunks 因單次 input budget 被截斷時，
才新增獨立的 multi-batch review plan。該 plan 必須處理 call budget、concurrency、finding
deduplication、partial failure 與跨 batch coverage，不能隱含在 engine adapter 裡。

## Learning Focus

- resource-safety limit 與 product-level review budget 為什麼是不同邊界。
- 如何讓不完整 review 保持可預測、可觀察且不誤導使用者。
- 為什麼完整 hunk clipping 比固定逐檔大小略過更適合 code review。

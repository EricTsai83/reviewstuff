# Atomic v1 roadmap

這是 007 之後唯一的 executable roadmap。所有 plan 都遵守 [README](./README.md) 的架構與
completion contract；除非該 plan 明列例外，verification 都先跑 `bun run typecheck` 與
`bun test`（注意目前 `bun run test` 會觸發 build，需先取得 build 授權）。

每個 plan 的 `Depends on` 只列直接前置 contract。`Out` 是硬邊界，不是「有空可以一起做」。

## 007 — Normalize review contracts

**Depends on:** 005、006。 **Learning:** public schema evolution。

**Working state:** deterministic review 仍維持原行為，但 engine input/output 將使用的
`ReviewFindingV1`、`ReviewReportV3` 與 decode boundary 已固定。

**In:** 定義 normalized severity/category/confidence finding；將 fake marker 映射到新 schema；
report 升版；加入 v2 report fixture 的 migration 或明確 refusal。 **Out:** engine service、prompt、provider。

**Steps:** 先寫 current/previous fixtures；建立 pure schema 與 migration；更新 renderer/use-case；
補 deterministic ID 與 invalid payload tests。

**Accept:** public value 都經 runtime decode；舊 fixture 不會被默默誤讀；human/JSON finding 數值一致；
沒有 provider-specific 欄位。

## 008 — Extract the fake review engine

**Depends on:** 007。 **Learning:** Effect semantic service boundary。

**Working state:** `runReview` 不再知道 fake marker rule；唯一 production engine 是 deterministic fake。

**In:** `ReviewEngine` contract、typed errors、fake canonical implementation/layer、use-case fake layer。
**Out:** provider registry、cloud/local adapters、retry、prompt building。

**Steps:** 定義最小 `review(request)` contract；移動 deterministic logic；由 App layer 提供 fake engine；
將 timeout 留在 use-case 或明確 engine boundary，只保留一個 owner。

**Accept:** `runReview` dependency 只有 semantic services；fake engine deterministic；engine failure 有 typed
CLI mapping；沒有空 provider skeleton。

## 009 — Build a pure review request

**Depends on:** 008。 **Learning:** pure prompt/request construction。

**Working state:** Git diff、config 與 repo metadata 可被純函式轉成 versioned `ReviewRequestV1`，fake engine
也走同一 contract。

**In:** `review/` pure module、system instructions、normalized file/diff envelope、request schema fixture。
**Out:** token clipping、redaction、network、provider formatting、analyzers。

**Steps:** 定義 request schema；把 prompt text 與 structured context 分開；加入 special filename/control
character fixtures；將 use-case 改為先 build request 再呼叫 engine。

**Accept:** builder 不依賴 IO/runtime/provider；相同輸入產生相同 request；repo content 明確標成 untrusted
data；fake 行為不回歸。

## 010 — Preserve normalized file and hunk metadata

**Depends on:** 009。 **Learning:** Git data contract before product policy。

**Working state:** Git layer回傳所有 scope files與可獨立選取的 complete hunk metadata；oversized file不再因沒有
patch text就從 changed-file identity消失。

**In:** normalized file/change/hunk contract、binary identity、original line counts、strict unified-diff parsing。
**Out:** budget estimation、selection、report rendering、provider request。

**Steps:** characterization 現有 large-file behavior；定義 Git-owned normalized result；strict parser保留完整 hunk；
binary/oversized仍回 file metadata；malformed/truncated Git output all-or-nothing failure。

**Accept:** changed file不因沒有 text patch消失；每個 hunk都完整；Git layer不做 AI budget policy；CommandRunner output
cap仍是 fatal typed failure。

## 011 — Select complete hunks within a request budget

**Depends on:** 010。 **Learning:** deterministic budget policy。

**Working state:** pure selector以 conservative estimate、fixed request overhead與 output reserve，round-robin選取可容納的
complete hunks。

**In:** estimator contract、whole-hunk selection、stable ordering、`reviewed|truncated|skipped` coverage schema。
**Out:** use-case/renderer integration、provider tokenizer SDK、多批 calls、semantic ranking。

**Steps:** current/edge schema fixtures；實作不低估 UTF-8/JSON escaping 的 fallback estimate；round-robin selector；
starvation、first-hunk-too-large、zero-budget fixtures。

**Accept:** 不切半個 hunk；same input/policy產生 same output；大型首檔不餓死後續小 hunk；selector無 IO/provider/Git依賴。

## 012 — Integrate budgeted coverage into review output

**Depends on:** 011。 **Learning:** one policy result shared across consumers。

**Working state:** `runReview`只把 selected hunks送進 engine，human/JSON report使用同一份 coverage，oversized text diff不再靜默
整檔略過。

**In:** use-case integration、request mapping、coverage renderer、effective budget metadata。 **Out:** session/agent output、
provider-specific truncation、多批 calls。

**Steps:** 在 engine call前執行 selector；禁止 engine二次 silent truncate；report summary使用 scope total；integration fixtures；
boundary test確認 Git/review/engine ownership。

**Accept:** serialized estimate不超 budget；所有 scope files恰有一個 coverage status；request/report數值一致；no selected hunks時
zero engine call或明確 skip policy。

## 013 — Enforce an explicit cloud privacy mode

**Depends on:** 012。 **Learning:** policy gate before transport。

**Working state:** fresh/default config 是 `local-only`；任何 cloud transport 都在 engine call 前被拒絕，
除非使用者明確選擇 `cloud-allowed`。

**In:** versioned privacy config、transport classification、typed policy refusal、effective policy metadata。
**Out:** secret detection、request preview、retention、provider implementation。

**Steps:** schema/migration；在 use-case 建立 pure policy check；fake/local transport fixtures；CLI/config
precedence 與 remediation。

**Accept:** `local-only` 零 cloud call；fake/local 不被錯誤阻擋；policy decision 可測且被 report metadata
記錄；不存在 silent override。

## 014 — Redact obvious secrets before engine input

**Depends on:** 013。 **Learning:** one-way data sanitization pipeline。

**Working state:** diff、paths/context 與 metadata 先經同一 pure redaction pipeline，再進任何 engine。

**In:** bounded secret detectors、stable replacement token、reason/count summary、false-positive fixtures。
**Out:** guaranteed secret detection、custom ignore file、session cleanup、raw prompt persistence。

**Steps:** 定義 redacted request contract；對 request tree 單次 traversal；確保 diagnostics/log 只輸出
reason/count；加入 API key/private key/high-entropy fixtures。

**Accept:** engine fake 可證明未收到原 secret；replacement deterministic；不在 error/debug 回顯 secret；
docs/type naming 不宣稱零洩漏。

## 015 — Preview the exact outbound request

**Depends on:** 014。 **Learning:** dry-run boundary and user consent。

**Working state:** `reviewstuff review --dry-run-request --json` 顯示 redaction 後、budget 後的 exact normalized
request，不呼叫 engine、不建立 session。

**In:** preview use-case/result、human/JSON renderer、exit policy。 **Out:** provider payload serialization、storage、
interactive confirmation。

**Steps:** 在 engine invocation 前分支；重用同一 builder/budget/redaction pipeline；加 spy engine 與
filesystem fake；文件標示 estimate 與實際 provider envelope 的界線。

**Accept:** zero engine calls、zero writes；preview 與隨後 engine 收到的 normalized request相同；machine
stdout 只有一份 JSON document。

## 016 — Implement the OpenAI Responses adapter

**Depends on:** 015。 **Learning:** structured-output adapter validation。

**Working state:** OpenAI adapter 可用 mocked HTTP/SDK fixtures 將 `ReviewRequestV1` 轉成 Responses API
request，並解析成 normalized findings；尚未接 CLI selection。

**In:** Responses API `text.format` JSON Schema strict output、`store: false`、auth/config、refusal/incomplete/
empty/schema/transport typed errors、timeout/output cap。 **Out:** live CLI wiring、retry、streaming、tool calls。

**Steps:** 以官方 current API contract 定義 boundary；adapter 只收 normalized request；mock completed、
refusal、incomplete 與 non-message output fixtures；邊界再以 Effect schema decode。

**Accept:** contract 無 OpenAI types；API response shape 不被直接信任；tests 不需 credentials；request 不啟用
server-side storage。參考 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)。

## 017 — Select and run the OpenAI engine

**Depends on:** 016。 **Learning:** implementation registry and composition root。

**Working state:** `reviewstuff review --engine openai --model <id> --privacy cloud-allowed --json` 可執行；
缺 credentials 時有明確 remediation。

**In:** minimal engine registry、CLI/config selection、OpenAI layer wiring、credential diagnostic、opt-in live smoke。
**Out:** Anthropic、Codex CLI、fallback、retry、doctor aggregation。

**Steps:** registry metadata 只描述已存在 implementations；selection precedence 為 CLI > config > provider
default；App layer 組合；unit/e2e 使用 fake transport；live smoke 明確標示費用與 prerequisite。

**Accept:** fake 仍為 deterministic default；缺 key 不 crash/不印 key；`local-only` 在 transport 前拒絕；
live smoke 不是一般 test gate。

## 018 — Select a repository with `--dir`

**Depends on:** 017。 **Learning:** changing the containment root safely。

**Working state:** `reviewstuff review --dir ../repo` 對指定 initialized working-tree repository 執行，config、
Git 與後續 paths 都以新 repo root 為準。

**In:** `--dir` validation/canonicalization、repo-root context、relative output paths。 **Out:** multi-repo review、
monorepo graph、remote clone。

**Steps:** 在 command boundary 解析候選 path；Git service 驗證並回傳 canonical root；讓 ConfigService 明確
取得 repo context 而非依賴 process cwd；加入 symlink/non-repo/bare repo fixtures。

**Accept:** 不改 process-global cwd；所有 path containment 使用選定 root；不存在路徑與 bare repo 有 typed
error；目前 repo default 行為不回歸。

## 019 — Review an exact committed range

**Depends on:** 018。 **Learning:** immutable Git range semantics。

**Working state:** `--since <ref>` 可 review 已驗證 commit 到 `HEAD` 的 committed diff；`--base-commit` 只是同一
exact-left-endpoint semantics 的清楚 alias。

**In:** commit/ref validation、committed diff source、scope metadata、mutual exclusion with staged-only。
**Out:** merge-base branch semantics、default branch inference、remote fetch。

**Steps:** 擴充 versioned scope；驗證 ref resolves to commit；以 literal argv 讀 diff/status；處理 detached HEAD、
unknown/ambiguous ref、rename/delete fixtures。

**Accept:** exact endpoint 不偷偷改成 merge-base；不自動 fetch；no-change 不呼叫 engine；report/session-ready
metadata 能重現 range。

## 020 — Review a branch using merge-base semantics

**Depends on:** 019。 **Learning:** branch comparison vs exact range。

**Working state:** `reviewstuff review --base main` 只 review merge-base 到 `HEAD` 的 branch changes。

**In:** base ref validation、merge-base resolution、three-dot-equivalent diff、scope metadata。 **Out:** automatic
base selection、working-tree composition、remote fetching。

**Steps:** separate exact-range and branch-range variants；resolve base/merge-base once；fixture divergent history、
missing merge base、detached HEAD；document difference from `--since`。

**Accept:** base branch tip 前進不會誤納 upstream-only commits；invalid/ref errors typed；Git commands bounded；
CLI flags incompatibility 在 engine call 前失敗。

## 021 — Compose committed and uncommitted scopes

**Depends on:** 020。 **Learning:** explicit scope algebra。

**Working state:** `--type committed|uncommitted|all` 有固定語意；`all` 合併 selected committed range 與 staged、
unstaged、untracked changes。

**In:** scope union/dedup、`--staged`/`--working-tree` shortcuts、compatibility matrix、source metadata。
**Out:** automatic base inference、path filters、fast profile。

**Steps:** 建立 pure scope planner；GitService 執行 planner operations；以 path+source 保留 coverage；測 staged
and unstaged same file、untracked、conflict、mutually exclusive flags。

**Accept:** shortcuts 只代表 uncommitted variants；`all` deterministic 且不重複計數；unmerged paths fail fast；
no-change zero engine calls。

## 022 — Infer a default branch scope conservatively

**Depends on:** 021。 **Learning:** safe defaults under incomplete repository metadata。

**Working state:** 無 scope flag 時，若 remote symbolic HEAD 可可靠解析就 review branch changes + uncommitted；
否則退回 uncommitted 並顯示 warning。

**In:** configured base precedence、remote symbolic HEAD discovery、fallback warning、detached/unborn behavior。
**Out:** network fetch、guessing `main`/`master`、using feature branch upstream as semantic base。

**Steps:** pure decision table；Git metadata operations；fixtures for no remote、stale/missing symbolic HEAD、feature
upstream、detached HEAD；report effective decision。

**Accept:** 不將 feature upstream 誤認 default branch；不連網；fallback 可觀察；explicit flags 永遠勝過 inference。

## 023 — Filter review paths explicitly

**Depends on:** 022。 **Learning:** user selection inside a repository boundary。

**Working state:** repeatable `--path <file-or-dir>` 只保留 scope 內符合的 paths。

**In:** pathspec normalization、file/directory matching、empty-selection behavior、scope metadata。 **Out:** ignore file、
generated/binary policy、glob language、monorepo graph。

**Steps:** 先 canonicalize user input；轉成 repo-relative literal selectors；pure filter after Git discovery；fixtures
for spaces/newlines/pathspec magic/symlink escape。

**Accept:** filters 不能離開 repo root；不把 user text 當 Git pathspec magic；repeat order 不影響結果；空結果
clean skip 且 zero engine calls。

## 024 — Apply `.reviewstuffignore` as exclusion-only policy

**Depends on:** 023。 **Learning:** documented ignore semantics。

**Working state:** repo-root `.reviewstuffignore` 可再排除 selected paths，並在 coverage 顯示 stable reason。

**In:** versioned/documented pattern semantics、ordered exclusion rules、config/read error、ignore hash metadata。
**Out:** negation that re-includes hard exclusions、global ignore file、secret redaction。

**Steps:** 選定並記錄 pattern grammar；pure matcher fixtures；Config/File boundary 安全讀取 single root file；
將 exclusion reason 加入 coverage。

**Accept:** ignore 只縮小 selection；invalid syntax 有行號與 typed error；symlinked ignore file policy 明確且有測試；
same file 產生 same policy hash。

## 025 — Centralize file skip policy

**Depends on:** 024。 **Learning:** observable conservative input policy。

**Working state:** binary、media、generated、lock、build output 都由單一 selection policy 判斷並回報 stable reason；
不在 Git adapter 或 engine 各自靜默略過。

**In:** hard exclusion vs overridable default、rename/delete location policy、config override、coverage summary。
**Out:** semantic generated detection、provider-specific truncation、language analyzers。

**Steps:** 將現有 binary/large behavior移到 pure selection contract；hard exclude binary/media；其餘 override 仍受
012 budget；補每個 heuristic fixture與 boundary test。

**Accept:** 每個 scope file 恰有一個 final status；override 不繞過 containment/hard cap；rename/delete 不 crash；
human/JSON/request coverage counts 一致。

## 026 — Add one fast review policy

**Depends on:** 025。 **Learning:** policy preset without branching architecture。

**Working state:** `--fast` 與兼容 alias `--light` 解析成同一個較小 request budget；其餘 pipeline 不分叉。

**In:** profile override、effective budget metadata、alias conflict handling。 **Out:** cheaper model auto-selection、
tool depth、provider pricing、deep review。

**Steps:** 在 config resolution 建立單一 `fast` policy；兩個 flags 映射同一 override；budget tests 比較 standard/
fast；renderer 顯示 effective policy。

**Accept:** aliases 完全等價；fast 的 request budget 可觀察且更小；不偷偷換 provider/model；仍遵守 redaction/
privacy/coverage。

## 027 — Define the persisted review session schema

**Depends on:** 026。 **Learning:** durable schema design before filesystem code。

**Working state:** `ReviewSessionV1` fixtures能表示 effective scope/policy、redacted normalized request、coverage、
engine metadata 與 findings，但尚未寫入 disk。

**In:** session/finding/request references、session ID rules、created-at injection、current/previous fixture policy。
**Out:** filesystem layout、latest lookup、raw pre-redaction diff/prompt、fix attempts。

**Steps:** 從實際 output contract設計 schema；只保存 014 redaction 後的 request；用 fake Clock/ID 產生 deterministic fixture；
定義 corrupt/unsupported version errors。

**Accept:** schema 不含 credentials/raw provider body；同一 finding schema不被複製成第二套；decode all-or-nothing；
future fix/analyzer欄位不先預留空殼。

## 028 — Store and load sessions atomically

**Depends on:** 027。 **Learning:** atomic single-file persistence and path containment。

**Working state:** `StorageService.save/load/latest` 可在 `.reviewstuff/sessions/<id>/session.json` 安全運作，尚未接
review use-case。

**In:** canonical storage service/layer、temp+fsync+rename、latest pointer strategy、symlink/traversal/size limits。
**Out:** retention cleanup、stats cache、multiple JSON child files、migration write-back。

**Steps:** 優先以單一 session file縮小 transaction；在 target directory 建 temp；驗 regular directory/file；
failure injection tests for truncated/corrupt/rename failure。

**Accept:** contract 不暴露 platform types；partial write 不成為 latest；repo 外零讀寫；load 有 byte cap；tests 使用
temporary repo。

## 029 — Persist successful review sessions

**Depends on:** 028。 **Learning:** use-case transaction boundary。

**Working state:** 每個非-preview、非-skipped review 成功後保存一個 session，JSON/human result 回報 session ID。

**In:** review-to-session mapping、storage failure semantics、latest update、partial provider result policy。
**Out:** query commands、cleanup、prompt snapshot、fix status。

**Steps:** 在 engine result decode 後建立 session；先 save 再 render success；明確決定 engine failure是否保存（v1
不保存 incomplete session）；e2e 驗 no-change/preview zero writes。

**Accept:** command 不直接用 filesystem；saved data等於 redacted request/output；storage failure不誤報 review success；
session ID deterministic only in tests, unpredictable in production。

## 030 — Query stored findings

**Depends on:** 029。 **Learning:** read-only application query。

**Working state:** `reviewstuff review findings [--session <id>] [--severity <value>] --json` 從 latest/指定 session讀取。

**In:** query use-case、severity filter、human/JSON result、missing/corrupt session errors。 **Out:** status mutation、stats、
prompt replay、provider calls。

**Steps:** command namespace下建立 canonical subcommand；query只依賴 StorageService；pure filtering/stable ordering；
fixture e2e。

**Accept:** zero engine calls/writes；unknown finding/session有清楚 error；JSON schema versioned；不建立重複 top-level alias。

## 031 — Replay a deterministic repair prompt

**Depends on:** 030。 **Learning:** reproducible derived artifacts。

**Working state:** `reviewstuff review prompts --finding <id> [--session <id>]` 從 stored redacted request + finding 產生
固定 prompt，不呼叫模型。

**In:** versioned pure prompt builder、prompt hash、human/JSON output。 **Out:** saving full prompts、current-worktree context、
fix engine、自動執行 prompt。

**Steps:** 定義最小 repair prompt schema；只引用 session snapshot；stable field ordering/escaping；fixture snapshot與 hash。

**Accept:** zero engine calls/writes；後續工作樹改動不改 replay；找不到所需 stored context時明確拒絕；output標示
redacted/session來源。

## 032 — Stream review events as NDJSON

**Depends on:** 031。 **Learning:** process protocol and lifecycle。

**Working state:** `reviewstuff review --agent` 的 stdout只含 versioned NDJSON：context、status、finding、heartbeat、
complete/error。

**In:** event envelope/sequence、review success/no-change/handled-error flows、stderr separation、heartbeat scoped resource、
exit mapping。 **Out:** fix/deep-review tool events、WebSocket、resume protocol。

**Steps:** schema fixtures first；將 use-case milestones映射 events；用 Effect scoped fiber管理 heartbeat；signal/EOF tests；
human與 `--json` path保持不變。

**Accept:** every line decodes；sequence嚴格遞增；正常/skip/handled error各一個 terminal complete；Ctrl-C停止 heartbeat；
consumer仍以 process exit + EOF判斷 abrupt interruption。

## 033 — Aggregate a minimal doctor report

**Depends on:** 032。 **Learning:** health contributions without layer leakage。

**Working state:** `reviewstuff doctor [--json]` 聚合 runtime、Git、config、storage、privacy與已註冊 engine availability。

**In:** `DoctorReportV1`、pass/warn/fail/not-available checks、typed contribution contract、exit policy。
**Out:** analyzer/update/install-channel guesses、paid inference、remote log upload。

**Steps:** 每個 semantic capability提供 side-effect-bounded health contribution；doctor use-case只聚合；credentials缺失
為 warning；network check只有明確 non-billable endpoint才允許。

**Accept:** no inference/repo upload；warnings exit 0、fail exit 1；JSON stable；command只 render report；尚不存在能力顯示
not-available而非猜測。

## 034 — Add a sandboxed Codex CLI engine

**Depends on:** 033。 **Learning:** local subprocess provider as a constrained adapter。

**Working state:** `reviewstuff review --engine codex-cli --model <id> --json` 將 normalized request交給 non-interactive
Codex，並得到 schema-constrained findings。

**In:** executable/version discovery、`codex exec --ephemeral --sandbox read-only --output-schema` integration、controlled
temp cwd、timeout/output cap、JSONL/final output parsing。 **Out:** `codex review` repo discovery、session resume、write sandbox、
installing/authenticating Codex。

**Steps:** capability probe current help/version；透過 CommandRunner以 argv執行；避免載入 user config/rules when supported；
adapter只傳 normalized request，不讓 Codex自行選 Git scope；fixture CLI tests。

**Accept:** use-case/contract無 CommandRunner；repo files不由 adapter直接讀；unsupported flag/version有 remediation；no shell；
follow current [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)。

## 035 — Retry only safe provider failures

**Depends on:** 034。 **Learning:** retry taxonomy and idempotence。

**Working state:** cloud engine對 rate-limit/temporary server errors使用 bounded backoff；auth、policy、schema、refusal與 budget
錯誤不 retry。Codex local engine預設不 retry。

**In:** retry classification、attempt cap、Retry-After handling、injectable Schedule/Clock、attempt diagnostics。
**Out:** provider fallback、circuit breaker、pricing、telemetry。

**Steps:** 先列 error decision table；把 retry wrapper放 cloud adapter shared boundary；deterministic no-jitter/jitter tests；
interruption cancels pending delay。

**Accept:** max attempts可證明；non-retryable exactly one call；timeout budget涵蓋所有 attempts；no silent engine switch。

## 036 — Persist provider run metadata

**Depends on:** 035。 **Learning:** observability without sensitive payloads。

**Working state:** report/session記錄 provider/model/transport、attempt latency/status、usage tokens（若 provider提供）與
unknown-aware cost metadata。

**In:** `ProviderRunMetadataV1`、per-attempt summary、usage mapping、optional versioned user pricing config。
**Out:** hard-coded current prices、remote telemetry、billing dashboard、stats cache。

**Steps:** schema fixture；adapters產生 typed metadata；use-case merge；renderer顯示 concise summary；redaction test所有 debug fields。

**Accept:** unknown usage/cost不當成 0；不保存 request/response body或 headers/secrets；retry attempts可追蹤；fake engine
metadata deterministic。

## 037 — Establish the pull-request CI gate

**Depends on:** 036。 **Learning:** reproducible verification in an untrusted PR context。

**Working state:** PR/main workflow以 frozen Bun lockfile執行 typecheck、tests、authorized build與 binary e2e，完全使用
fake providers/fixtures。

**In:** least-permission GitHub Actions workflow、pinned toolchain/actions policy、job separation、safe failed-test artifacts。
**Out:** tag releases、signing secrets、provider live smoke、publish permissions。

**Steps:** 將 local commands拆成可定位 jobs；避免 `pull_request_target` 執行 untrusted code；cache只放 dependencies；
artifact allowlist；document required checks。

**Accept:** fork PR無 secrets/write token；failure能定位 typecheck/unit/build/e2e；CI不需 credentials；uploaded diagnostics不含
source/provider/session payload。

## 038 — Package one release artifact deterministically

**Depends on:** 037。 **Learning:** artifact identity and provenance。

**Working state:** local/CI可產生單一 `darwin-arm64` tarball、`SHA256SUMS`、versioned manifest與 build provenance。

**In:** package script、fixed tar layout/order/mode/mtime、artifact checksum/size/target、source commit/toolchain metadata。
**Out:** signing、notarization、Homebrew/npm、multi-platform matrix、manifest signature。

**Steps:** 定義 `ReleaseManifestV1`；package existing standalone binary；round-trip extract/verify；量測 reproducibility，若 Bun
binary不 bit-for-bit deterministic只記錄 provenance，不虛假宣稱 reproducible。

**Accept:** manifest逐一匹配 bytes；archive只有預期 executable/docs；checksum只宣稱 integrity、不宣稱 authenticity；wrong
version/target拒絕。

## 039 — Sign and notarize the macOS executable

**Depends on:** 038。 **Learning:** Apple distribution trust boundary。

**Working state:** opt-in script以 Developer ID、hardened runtime、secure timestamp簽署 executable，提交 notary service並驗證
Gatekeeper；無 credentials 的 dev build仍可用。

**In:** credential preflight、codesign/notarytool/log verification、final artifact repackage/checksum、clean-runner smoke。
**Out:** certificate provisioning、publishing release、Windows signing。

**Steps:** 先在實作時依 current Apple docs/man pages確認可上傳 archive與 ticket stapling支援，不硬編過期假設；secret只由
CI store注入；sign後才 package final bytes；保存 non-secret submission evidence。

**Accept:** unsigned bytes絕不沿用 final checksum；sign/notary failure不產生 releasable artifact；strict codesign + Gatekeeper smoke
通過；log不洩漏 credentials。參考 [Apple notarization guidance](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。

## 040 — Automate a draft signed release

**Depends on:** 039。 **Learning:** release pipeline separated from PR CI。

**Working state:** manual dispatch或 version tag在 trusted runner建立 signed/notarized darwin-arm64 draft release與 release notes；
不自動 promote/publish channels。

**In:** version/tag consistency、trusted environment、artifact verification/upload、draft release、provenance。
**Out:** npm publish、Homebrew tap push、multi-platform matrix、automatic production promotion。

**Steps:** 先 build unsigned candidate；在 secrets隔離 job簽署/notarize；重新 package/verify；只上傳 final bytes；manual approval後
才允許 release從 draft轉正式。

**Accept:** tag/package/manifest/artifact version一致；untrusted PR無法進 secret job；下載 artifact smoke通過；失敗維持 draft且不
覆蓋 previous release。

## 041 — Install the signed artifact with Homebrew

**Depends on:** 040。 **Learning:** one installation channel consuming canonical bytes。

**Working state:** test-only tap formula下載 040 的 exact signed tarball/checksum，安裝後可執行 version與 fake/no-change smoke。

**In:** formula、checksum pin、unique temporary tap harness、audit/test/cleanup、doctor channel contribution。
**Out:** automatic tap publication、source build、multi-arch formula、self-update。

**Steps:** formula不 rebuild；test harness用 fixture/local release或 draft URL；finally清理唯一 tap；production formula update需 manual
review且指向 immutable release URL。

**Accept:** 不碰使用者既有 tap/formula；formula bytes與 manifest相同；install smoke無 credentials；doctor不靠猜 path而由 installed
wrapper/contribution辨識 Homebrew。

## 042 — Install the signed artifact from one npm platform package

**Depends on:** 041。 **Learning:** npm meta + optional platform package pattern。

**Working state:** local packed `reviewstuff` + `@reviewstuff/darwin-arm64` 在 temporary project安裝並執行同一 signed binary。

**In:** exact-version optional dependency、`os`/`cpu` metadata、allowlisted wrapper、isolated pack/install test、doctor contribution。
**Out:** npm publish、install-time download/build、Linux/x64 packages、self-update。

**Steps:** package只含 wrapper/對應 binary；wrapper只解析固定 package name；使用 repo既有 Bun package manager測 local tarballs；
驗 tar contents/mode/checksum/version。

**Accept:** no install scripts/network download；unsupported platform有清楚 error；不改 global package state；npm與release manifest bytes
一致。

## 043 — Document the privacy and security contract

**Depends on:** 042。 **Learning:** docs as executable product contract。

**Working state:** 使用者可準確理解 local/cloud data flow、request preview、redaction限制、local session內容與 vulnerability
reporting流程。

**In:** privacy/security docs、data-flow table、threat-model summary、redaction residual risk、SECURITY.md。
**Out:** install quickstart、provider setup walkthrough、marketing site、enterprise policy。

**Steps:** 以 013–015、027–029 的實際 schema/data為 source；逐一列出 sent/stored/not-stored data；加入 request preview與
session inspection examples；定義 security report channel與 supported versions。

**Accept:** 清楚說 secret detection非保證；不宣稱 local provider等於零外部風險；privacy內容與 normalized request/session storage
一致；沒有 backlog feature承諾。

## 044 — Document installation and first review

**Depends on:** 043。 **Learning:** executable onboarding documentation。

**Working state:** 新使用者可從 README選 Homebrew/npm/local安裝、設定 OpenAI或Codex CLI、preview request、完成 first review與
agent-mode example。

**In:** quickstart、provider setup、configuration reference、install/update guidance、troubleshooting、NDJSON recipe、docs smoke harness。
**Out:** marketing site、unsupported platform instructions、backlog commands。

**Steps:** 以實際 `--help`與 schema生成/核對 examples；所有無 credentials commands進 smoke；live/provider/Apple命令標 prerequisite、
成本與副作用；列出 darwin-arm64 support boundary。

**Accept:** docs不提不存在 flags；agent example只解析 NDJSON；Homebrew/npm指向相同 signed version；fresh-user fixture可照 quickstart
完成 fake/no-change smoke。

## 045 — Pass the read-only macOS v1 readiness gate

**Depends on:** 044。 **Learning:** release criteria without adding features。

**Working state:** 可正式發布「macOS arm64、read-only、OpenAI cloud或Codex CLI local」v1；其他能力明確列為 unsupported/backlog。

**In:** full deterministic suite、binary/release/install smokes、opt-in provider smokes、privacy/no-change/error/interrupt NDJSON matrix、schema
compatibility、threat-model audit、release notes/known issues。 **Out:** new feature、large refactor、waiving security/data-loss blockers。

**Steps:** 建 checklist與 evidence links；驗 tag/source/provenance/signed bytes/manifest/Homebrew/npm一致；current+previous fixtures；live cloud
smoke在 gated budget environment；未過項目回到 owning plan修正。

**Accept:** no known data-loss/default secret leakage/authenticity blocker；install channels指向同一 final bytes；agent success/skip/error contracts
stable；只有 non-critical limitation可帶 owner/reason/expiry列 known issue；production tag不宣稱支援 backlog功能。

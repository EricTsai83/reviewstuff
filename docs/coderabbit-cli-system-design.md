# CodeRabbit CLI System Design Analysis

Date: 2026-07-09

Target artifact: `/Users/eric/.local/bin/coderabbit`

Observed version: `0.6.5`

SHA-256: `241842f5f08fa9ca75afb40fa145bea0a4fab8b382f99b521bbcd62ed129ae07`

## Scope

This document analyzes the locally installed CodeRabbit CLI as a closed-source binary. It focuses on what can be observed from the binary, command behavior, local storage, and one controlled probe review.

This is not a server-side source review. The CodeRabbit backend, its model prompts, and its tRPC router implementation are not available from the CLI binary. Where this document describes backend behavior, it is either based on wire-facing CLI interfaces or explicitly marked as inference.

## Method

Evidence gathered:

- CLI metadata: `which`, `--version`, `--help`, `file`, `otool -L`, `codesign`.
- Command tree: all public help screens and subcommand help screens.
- Static binary analysis: targeted `strings` extraction from the embedded bundled JavaScript.
- Follow-up static extraction around Git, review event handling, local storage, timeout, and agent-output code paths.
- Local mock server capture: `CODERABBIT_HOST_URL=http://127.0.0.1:18765` with a fake API key and synthetic repo.
- Local state inspection: `~/.coderabbit` file layout, JSON key shapes, logs with token-like content avoided.
- Runtime behavior: `coderabbit doctor`, `auth status --agent`, `stats`, `review --agent` on a synthetic `/tmp/coderabbit-probe` repository.

The probe review used only artificial code in `/tmp/coderabbit-probe`. It created one local CodeRabbit review session and updated local stats to `1` review / `2` issues.

## Executive Summary

The CLI is a thin review orchestrator, not the full reviewer. It collects local Git context, changed file diffs, file contents, optional instruction/config files, auth/org metadata, and previous review state. It then sends that payload to CodeRabbit's backend over tRPC/WebSocket and renders streamed review events.

The actual review intelligence and reviewer system prompt appear to live server-side. The CLI does not contain a full review prompt. The only prompt-like material visible at the CLI boundary is `codegenInstructions`, returned by the backend per finding and stored locally for `coderabbit review --show-prompts`.

Strong conclusions:

- Runtime/package shape: Bun standalone executable containing bundled JavaScript/TypeScript.
- CLI framework: Commander-style command tree.
- API style: tRPC client over both HTTP and WebSocket.
- Review transport: WebSocket tRPC procedure calls under `vsCode.*`.
- Local state: `~/.coderabbit`, plus macOS credential storage through `Bun.secrets`.
- Review orchestration: client-side timeout, stale-event filtering, local incremental state, and local finding persistence are implemented in the CLI.
- Effect TS library: no convincing evidence that `effect` / `@effect/*` is used by this CLI.

## High-Level Architecture

```text
User / agent
  |
  v
coderabbit CLI
  |
  +-- command router
  |     auth, review, findings, stats, doctor, feedback, update
  |
  +-- auth service
  |     auth.json + Bun.secrets + OAuth/API key/self-hosted flows
  |
  +-- git service
  |     git CLI, branch/base resolution, diff, file content, remotes
  |
  +-- review service
  |     builds extensionEvent payload, connects to tRPC/WebSocket
  |
  +-- storage service
  |     local review sessions, findings, prompts, internal state, stats
  |
  +-- logging / telemetry / update
        winston logs, PostHog-style telemetry, auto-update

External systems
  |
  +-- Git executable
  +-- macOS credential storage via Bun.secrets
  +-- CodeRabbit HTTP backend: https://app.coderabbit.ai
  +-- CodeRabbit WebSocket backend: wss://ide.coderabbit.ai/ws
  +-- CodeRabbit release/config endpoints: https://cli.coderabbit.ai
  +-- Git provider APIs / metadata, inferred from provider support
```

## Tech Stack

Observed or strongly inferred:

| Area | Evidence | Notes |
| --- | --- | --- |
| Runtime | Mach-O arm64 binary containing Bun runtime strings and bundled JS modules | `file` reports native executable; embedded source references `Bun`, `Bun.secrets`, Bun modules. |
| Language | JavaScript/TypeScript bundle | Source fragments include classes, imports, async functions, zod schemas. |
| CLI parser | Commander-style API | The command tree uses `.command()`, `.option()`, `.action()`, `.configureHelp()`, `unknownOption`, `unknownCommand`. |
| API client | tRPC | Embedded code constructs `/trpc` client and uses `.query`, `.mutate`, `.subscribe`. |
| WebSocket | `ws` / Bun WebSocket | Review path uses a WebSocket tRPC link and custom WebSocket headers. |
| Validation | zod | `zod` and schema parsing are present, including auth/user schemas. |
| Logging | winston | Embedded winston logger code; runtime logs are JSON in `~/.coderabbit/logs`. |
| Credential storage | `Bun.secrets` | Auth storage class calls `Bun.secrets.set/get/delete`. |
| Telemetry | PostHog-style endpoints | `eu.i.posthog.com`, `us.i.posthog.com`, telemetry event names such as `cli_review_start`. |
| Update | CodeRabbit release endpoint + Homebrew detection | Update command checks whether managed by Homebrew and otherwise downloads releases. |
| Effect TS | Not found | No `@effect/*` imports or real Effect API usage were found. See Effect section. |

Some dependency strings appear because the binary contains Bun runtime and package-manager internals. This document treats a library as part of CodeRabbit only when it appears in CodeRabbit-specific execution paths or source fragments.

## Public CLI Interface

Top-level commands:

```text
coderabbit auth
coderabbit review
coderabbit stats
coderabbit update
coderabbit feedback
coderabbit doctor
```

Review command:

```text
coderabbit review
coderabbit review --agent
coderabbit review --plain
coderabbit review --light
coderabbit review --type all|committed|uncommitted
coderabbit review --config <files...>
coderabbit review --base <branch>
coderabbit review --base-commit <commit>
coderabbit review --dir <path>
coderabbit review --api-key <key>
coderabbit review --show-prompts
coderabbit review findings
```

Hidden or deprecated review options observed:

- `--fast`: hidden alias/variant for light review behavior.
- `--interactive`: hidden; explicitly logged as removed and continues without it.
- `--cwd <path>`: hidden alias used internally.
- `--prompt-only`: explicitly rejected with guidance to use `--agent`.

Auth commands:

```text
coderabbit auth login
coderabbit auth login --agent
coderabbit auth login --self-hosted
coderabbit auth login --api-key <api-key>
coderabbit auth logout
coderabbit auth logout --agent
coderabbit auth status
coderabbit auth status --agent
coderabbit auth org
coderabbit auth org --agent
```

Other commands:

```text
coderabbit stats
coderabbit stats --rebuild
coderabbit doctor
coderabbit update
coderabbit feedback [--agent] <message...>
```

## Environment Interface

Observed CodeRabbit-specific env vars:

| Variable | Role |
| --- | --- |
| `CODERABBIT_HOST_URL` | Overrides the hosted CodeRabbit base URL. Must be http/https and pathless. |
| `CODERABBIT_CLI_DISABLE_AUTO_UPDATE` | Disables auto-update when set to `"true"`. |
| `CODERABBIT_LOG_LEVEL` | Controls logging level. |
| `CODERABBIT_LOG_TRANSPORT` | Controls log transport: file/console/both style. |
| `CR_CLI_LOG_FILE` | Overrides log file path. |
| `CR_CLI_AUTH_TIMEOUT` | Timeout for auth token exchange, default observed as `30000`. |
| `CR_CLI_TELEMETRY_DISABLED` | Disables telemetry. |
| `CR_CONFIG` | Present in binary; exact role not fully reconstructed. |
| `CR_CLI_DOCTOR_SOURCE` | Used to label install/doctor source. |

## Network Interface

Default service URLs:

```text
handlerUrl/authenticationBaseUrl/billingFuncUrl: https://app.coderabbit.ai
websocketUrl: wss://ide.coderabbit.ai/ws
public config: https://cli.coderabbit.ai/public-configs.json
releases: https://cli.coderabbit.ai/releases
```

With `--host-url` or `CODERABBIT_HOST_URL`, the CLI derives:

```text
https://your-host.example        -> HTTP tRPC/API base
wss://your-host.example/ws       -> WebSocket base
```

Observed HTTP endpoints:

| Endpoint | Purpose |
| --- | --- |
| `${handlerUrl}/trpc` | Main tRPC HTTP endpoint. |
| `${handlerUrl}/cli/validate-api-key` | API key validation. |
| `${authenticationBaseUrl}/login` | Browser OAuth entrypoint. |
| `${billingFuncUrl}/checkAndCreateUser` | User lookup/creation during auth. |
| `${selfHostedUrl}/health` | Self-hosted validation. |

Observed WebSocket endpoint:

```text
wss://ide.coderabbit.ai/ws
```

## tRPC Usage

The CLI has two tRPC client paths.

HTTP tRPC client factory:

- Builds URL `${handlerUrl}/trpc`.
- Adds auth headers based on stored tokens, API key, org, workspace, and provider.
- Used for auth/session/org operations.

WebSocket tRPC client:

- Connects to `wss://ide.coderabbit.ai/ws` or self-hosted `/ws`.
- Adds CodeRabbit-specific headers.
- Used for live review events and review initiation.

Observed tRPC procedures:

| Procedure | Kind | Observed role |
| --- | --- | --- |
| `accessToken.getAccessAndRefreshToken` | query | OAuth code exchange. |
| `accessToken.refreshToken` | query | Refresh expired access token. |
| `organizations.getAllOrgs` | query | Fetch organizations for a provider/user. |
| `organizations.getAllOrgsForWorkspace` | query | Fetch organizations for Clerk-backed workspace context. |
| `session.getUser` | query | Fetch Clerk-backed session context. |
| `users.getOrCreateExtensionProfile` | mutate | Present in bundle; likely shared extension/client code. |
| `vsCode.registerClient` | mutate | Register the CLI client before review events. |
| `vsCode.requestFullReview` | mutate | Send review payload to backend. |
| `vsCode.subscribeToEvents` | subscribe | Stream review status/comments/completion events. |

Headers observed in API/WebSocket paths:

```text
Authorization: Bearer <access token>
x-coderabbitai-api-key: <api key>
x-coderabbitai-organization: <org id>
X-CodeRabbit-Organization: <org id>
x-coderabbitai-workspace: <workspace id>
x-clerk-git-provider: <provider>
X-CodeRabbit-CLI-ClientId: <machine/client id>
X-CodeRabbit-CLI-Version: <cli version>
X-CodeRabbit-Client: cli
```

In direct `coderabbit review --api-key <key>` mode, a local mock-server capture showed the API key is sent in two places on the WebSocket connection:

- `x-coderabbitai-api-key` header.
- initial tRPC WebSocket `connectionParams` message as `{ "apiKey": "<key>" }`.

In that direct review mode, the CLI did not call `/cli/validate-api-key`; that validation endpoint is used by `coderabbit auth login --api-key`.

Observed raw tRPC WebSocket message sequence from the mock capture:

```json
{"method":"connectionParams","data":{"apiKey":"<api key>"}}
```

Then the CLI batched subscription startup and client registration in one WebSocket frame:

```json
[
  {
    "id": 1,
    "method": "subscription",
    "params": {
      "input": {"clientId": "cli/<machine-id>"},
      "path": "vsCode.subscribeToEvents"
    }
  },
  {
    "id": 2,
    "method": "mutation",
    "params": {
      "path": "vsCode.registerClient"
    }
  }
]
```

Then it sent the review request:

```json
{
  "id": 3,
  "method": "mutation",
  "params": {
    "path": "vsCode.requestFullReview",
    "input": {"extensionEvent": "..."}
  }
}
```

After mock `review_completed`, the client sent:

```json
{"id":1,"method":"subscription.stop"}
```

## Review Pipeline

Review command entrypoint:

```text
coderabbit review -> Ae(options) -> Oe(review options) -> ReviewService.startReview()
```

Sequence:

1. Parse options and normalize mode:
   - `--agent` -> structured JSON output.
   - otherwise plain text mode.
   - `--light` or hidden `--fast` -> lighter review request.
   - The common typo `--type uncommited` is accepted, warned about, and normalized to `uncommitted`.

2. Validate Git:
   - Must be inside a Git repo.
   - Determines current branch, base branch, base commit, head commit.
   - If base branch cannot be inferred, user must pass `--base` or set `git config coderabbit.baseBranch <branch>`.

3. Validate auth:
   - Uses stored OAuth/self-hosted/API key auth.
   - If not logged in and allowed, triggers login flow.
   - API key can be passed directly with `--api-key`.

4. Build scoped git service:
   - `createScopedReviewGitService()` wraps the raw git service.
   - `--dir` constrains review files to a subdirectory.

5. Collect review inputs:
   - changed files from committed/uncommitted/all depending on `--type`.
   - per-file diff.
   - per-file full content, if readable.
   - commit metadata.
   - remote URL and remotes.
   - previous internal state.
   - previous incremental diff data.
   - CodeRabbit config/instruction files.

6. Add config/instruction files:
   - Explicit `--config <files...>` files are read if present.
   - Without explicit config, it searches:
     - `.coderabbit.yaml`
     - `.coderabbit.yml`
     - `coderabbit.yaml`
     - `coderabbit.yml`
   - The first default config found is added to the review payload.
   - Although help mentions `claude.md` as an example for `--config`, the default search list does not include `CLAUDE.md`.

7. Construct payload:

```text
{
  extensionEvent: {
    userId,
    userName,
    email,
    clientId,
    eventType: "REVIEW",
    reviewId,
    files: [
      {
        filename,
        diff,
        newFile,
        renamedFile,
        deletedFile,
        fileContent
      }
    ],
    hostUrl,
    provider,
    providerUserId,
    remoteUrl,
    remotes,
    host: "cli",
    version,
    orgId,
    headCommitId,
    baseCommitId,
    selectedOrgIsTrial,
    cliReviewLight,
    cliReviewFast,
    allFiles,
    previousState
  }
}
```

Mock-captured direct API key payload notes:

- With a temp `HOME` and only `--api-key`, `userId`, `userName`, and `providerUserId` fell back to `clientId`.
- `email` was an empty string.
- `provider` defaulted to `github`.
- `orgId` became `self-hosted`, which appears to be the direct API-key/no-org fallback.
- `hostUrl` and `remoteUrl` were empty in a repo without remote.
- `--light` set both `cliReviewLight: true` and `cliReviewFast: true`.
- With no prior incremental state, `files` and `allFiles` had the same two entries in the capture.

8. Start remote review:
   - Connect WebSocket tRPC.
   - Subscribe to `vsCode.subscribeToEvents`.
   - Call `vsCode.registerClient`.
   - Call `vsCode.requestFullReview(payload)`.
   - Arm a one-hour timeout (`3600000` ms).

9. Handle backend events:

| Event type | CLI behavior |
| --- | --- |
| `review_comment` | Generates local line-range diff, persists finding, emits/render finding. |
| `review_status` | Emits progress status; `review_skipped` becomes an error with previous finding count. |
| `state_update` | Saves backend internal state for incremental follow-up reviews. |
| `review_completed` | Persists all review data, records stats, closes connection. |
| `rate_limit_exceeded` | Emits recoverable rate-limit error. |
| `error` | Emits review error and stops review. |

The event handler serializes WebSocket event processing through a promise queue. It also drops stale WebSocket events when an event carries a `reviewId` that does not match the current active review id, and records telemetry named `cli_review_event_dropped`.

10. Render output:
    - Plain text mode prints formatted findings and summary.
    - Agent mode emits newline-delimited JSON events.

## Agent JSON Interface

A probe run produced this event sequence shape:

```json
{"type":"review_context","reviewType":"uncommitted","currentBranch":"main","baseBranch":"main","workingDirectory":"/private/tmp/coderabbit-probe"}
{"type":"status","phase":"connecting","status":"connecting_to_review_service"}
{"type":"status","phase":"analyzing","status":"setting_up","message":"..."}
{"type":"status","phase":"setup","status":"setting_up"}
{"type":"status","phase":"analyzing","status":"summarizing"}
{"type":"status","phase":"analyzing","status":"reviewing"}
{"type":"finding","severity":"critical","fileName":"index.js","codegenInstructions":"...","suggestions":["..."]}
{"type":"complete","status":"review_completed","findings":2,"reviewedFiles":["index.js"]}
```

Additional agent-mode behavior found in the binary:

- While the backend status is `reviewing`, the CLI emits heartbeat events every `45000` ms:

```json
{"type":"heartbeat","status":"reviewing"}
```

- If there are no files to review, agent mode emits:

```json
{"type":"review_context","reviewType":"uncommitted","currentBranch":"main","baseBranch":"main","workingDirectory":"/repo"}
{"type":"status","phase":"setup","status":"review_skipped","message":"No uncommitted changes detected"}
{"type":"complete","status":"review_skipped","findings":0,"message":"No uncommitted changes detected"}
```

- Status phase mapping is lossy by design:
  - `connecting_to_review_service` -> `connecting`
  - `setting_up`, `preparing_sandbox` -> `setup`
  - all other statuses -> `analyzing`

Finding output in agent mode is intentionally compact. The formatter emits:

```text
{
  type: "finding",
  severity,
  fileName,
  codegenInstructions,
  suggestions,
  comment
}
```

If `codegenInstructions` is present, `comment` is omitted from agent JSON. If not, `comment` is included.

## Stored Finding Schema

A stored review comment JSON file contains:

```text
id
timestamp
fileName
title
startLine
endLine
type
indicatorTypes
commentCategory
severity
comment
codegenInstructions
fingerprint
suggestions
diff
originalLines
modifiedLines
lineRange
hasChangesInRange
fileStatus
actionStatus
```

Known category labels:

```text
SECURITY_AND_PRIVACY
STABILITY_AND_AVAILABILITY
DATA_INTEGRITY_AND_INTEGRATION
FUNCTIONAL_CORRECTNESS
PERFORMANCE_AND_SCALABILITY
MAINTAINABILITY_AND_CODE_QUALITY
```

Known severities:

```text
critical
major
minor
trivial
info
```

## Prompts

There are three different "prompt" surfaces.

### 1. User-supplied instructions

The CLI can send local instruction/config files to the backend:

```text
coderabbit review --config claude.md coderabbit.yaml
```

Default search, without `--config`:

```text
.coderabbit.yaml
.coderabbit.yml
coderabbit.yaml
coderabbit.yml
```

These files are sent in the same `files` array as normal review inputs, with `fileContent` populated and empty diff.

### 2. Backend reviewer prompt

The full review system prompt was not found in the CLI binary. The review model prompt appears to be server-side.

Reasoning:

- The CLI payload sends code, diffs, config, metadata, and previous state.
- The actual review is requested by `vsCode.requestFullReview`.
- Review comments, suggestions, and agent instructions arrive later via WebSocket events.
- Static scanning found no full reviewer prompt template in the CLI beyond UI text and instruction labels.

### 3. Agent repair prompt

Each returned finding may include `codegenInstructions`. This is the prompt that `coderabbit review --show-prompts` replays.

The probe review generated prompts with this structure:

```text
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @<file> around lines <start> - <end>, <finding-specific repair instruction>.
```

For the synthetic SQL injection finding, the backend asked the agent to replace string-concatenated SQL with a parameterized/prepared query and verify the placeholder syntax matches the database driver.

For the synthetic hardcoded password finding, the backend asked the agent to move away from a hardcoded plaintext credential and use hash/KDF-backed constant-time verification.

Important: these are backend-generated per-finding repair prompts, not the backend's own reviewer system prompt.

## Local Storage Design

Storage root:

```text
~/.coderabbit
```

Known object map:

```text
auth        -> auth.json
doctor      -> doctor.json
logs        -> logs
machine-id  -> machine-id
reviews     -> reviews
stats       -> stats.json
```

Auth storage:

- Config file: `~/.coderabbit/auth.json`.
- File permissions are set to private modes where possible.
- OAuth access token, refresh token, and self-hosted GitHub PAT are stored via `Bun.secrets` under service `@coderabbitai/cli`.
- If secure storage is unavailable, tokens fall back to file-based storage.
- API-key login path visibly writes `{ type: "api_key", apiKey }` through the same config writer. In the extracted code path, the API key remains in the auth config rather than being moved to `Bun.secrets`.

Review storage:

```text
~/.coderabbit/reviews/<project-hash>/<branch-hash>/reviews/<timestamp>/
```

Hash derivation:

```text
project-hash = md5(workingDirectory).slice(0, 8)
branch-hash  = md5(`${currentBranch}~${baseBranch}`).slice(0, 8)
finding-id   = random UUID
```

Session files:

```text
git.json
diff.json
incrementalDiff.json
internalState.json
<finding-id>.json
```

The storage service keeps at most 10 sessions per branch.

`git.json` contains:

```text
head
baseBranch
currentBranch
baseCommitId
diff
timestamp
workingDirectory
```

`diff.json` contains changed file records:

```text
filePath
status
diff
linesAdded
linesRemoved
```

`incrementalDiff.json` contains the payload-style file records:

```text
filename
diff
fileContent
newFile
renamedFile
deletedFile
```

`internalState.json` is backend state. In the probe it contained keys such as:

```text
crReviewed
detailedCodeBlockSummaryRanges
prObjectives
rawSummary
rawSummaryMap
reviewedCommitIds
```

Stats storage:

```text
~/.coderabbit/stats.json
```

Shape:

```text
totalReviews
totalIssues
dailyStats
lastUpdated
```

Logs:

```text
~/.coderabbit/logs/<timestamp>-coderabbit-cli-<uuid>.log
```

Logs are JSON lines. The logger keeps roughly 10 recent CodeRabbit CLI log files.

## Auth Design

Supported auth types:

- SaaS OAuth login.
- Agent-friendly OAuth login.
- API key login.
- Self-hosted login.

OAuth flow:

1. Generate URL at `${authenticationBaseUrl}/login`.
2. Include:
   - `client=cli`
   - `state`
   - `redirect_uri`
   - optional `variant`
   - optional `git_remote_owner`
3. Receive callback as URL/query/base64 token.
4. Exchange code with `accessToken.getAccessAndRefreshToken`.
5. Fetch user data and organizations.
6. Store auth config and tokens.

Self-hosted flow:

- Validates `<self-hosted-url>/health` expecting an OK response.
- WebSocket URL is derived by replacing `http` with `ws` and appending `/ws`.
- For GitHub self-hosted auth, the CLI expects a provider token/PAT.

Organization selection:

- OAuth auth stores organizations and current org.
- Interactive `auth org` shows a terminal picker if organization count is not too large.
- Agent `auth org --agent` emits available organizations as JSON.

## Git Design

The CLI shells out to Git.

Observed responsibilities:

- Detect whether inside work tree.
- Resolve repository root.
- Determine current branch and base branch.
- Read configured defaults:
  - `coderabbit.baseBranch`
  - `coderabbit.defaultBranch`
- Read upstream and remote origin.
- Enumerate remotes.
- Build committed/uncommitted/all diffs.
- Generate diff snippets for finding line ranges.
- Read `git config user.email` for self-hosted attribution.

Base branch detection order:

1. Explicit `--base`.
2. Stored `git config coderabbit.baseBranch`.
3. Stored or fetched default branch from `git config coderabbit.defaultBranch`.
4. `git remote show origin` `HEAD branch`.
5. `remote.origin.HEAD` from Git config.
6. Common remote branch fallback: `main`, `master`, `develop`, `development`, `trunk`.
7. Current branch upstream via `@{upstream}`.
8. Local/remote `main` or `master` if different from the current branch.

When `--base <branch>` is used, the CLI resolves `origin/<branch>` first, then `<branch>`. If the branch cannot be resolved but `--base-commit <sha>` is present, it can still proceed with the commit override. Otherwise it tells the user to `git fetch origin` or pass `--base-commit`.

Diff collection details:

- Committed diff: `git diff <base>...HEAD`.
- Staged diff: `git diff --cached`, or `git diff <base-commit> --cached` when a base commit is supplied.
- Unstaged diff: `git diff`, or `git diff <base-commit>` when a base commit is supplied.
- Untracked files are converted into synthetic `diff --git` patches with all lines marked as additions.
- Per-diff max buffer/content size is `20 MB`; oversize diffs become `[Diff too large - exceeds 20MB limit]`.
- File-change processing uses a concurrency limiter set to `32`.
- Duplicate file entries are de-duplicated by path, preferring non-new changes over new changes and then the larger line-change count.

Directory scoping:

- `--dir` is implemented as a scoped review directory relative to the git root.
- Files outside the scope are filtered out.
- If the scope resolves outside the repository, the CLI throws.

Remote attribution:

- The backend uses remote/remotes to map the review to an organization.
- In the probe repo with no remote, the backend accepted the review but reported that it could not match the repo to an organization and would use the free CLI allowance.
- Remote enumeration reads `remote.*.url` and `remote.*.pushurl`, returning both fetch and push URLs where present.
- SSH host aliases are normalized by reading `~/.ssh/config` `Host` / `Hostname` entries for common Git host patterns.
- Known hostnames are treated specially: `github.com`, `gitlab.com`, `bitbucket.org`, `dev.azure.com`, `ssh.dev.azure.com`.

Suggestion application:

- Returned suggestions can be applied locally.
- The CLI rejects target paths outside the repository root.
- It applies suggestions by fuzzy matching the stored `modifiedLines` against current file content with an observed threshold of `0.8`.
- If the file has changed too much since review, suggestion application fails instead of blindly patching.

## Doctor Command Design

`coderabbit doctor` runs a local readiness check:

```text
runtime
storage
service URLs
authentication
auth environment
git repository
update policy
backend reachability
websocket reachability
```

For SaaS, it checks:

- `https://app.coderabbit.ai` reachability through `/cli/validate-api-key`.
- `wss://ide.coderabbit.ai/ws` reachability via WebSocket upgrade headers.

For self-hosted, network checks derive from the configured self-hosted URL.

## Update Design

The update command:

- Checks whether the CLI is managed by Homebrew.
- If managed by Homebrew, tells the user to run `brew upgrade coderabbit`.
- Otherwise checks `https://cli.coderabbit.ai/releases`.
- Auto-update is skipped for self-hosted mode.
- Auto-update can be disabled by `CODERABBIT_CLI_DISABLE_AUTO_UPDATE=true`.

The CLI also schedules auto-update cleanup on process exit unless disabled.

## Telemetry and Feature Flags

Observed telemetry behavior:

- Initializes telemetry on startup unless disabled.
- Emits events such as:
  - `cli_launched`
  - `cli_review_start`
  - `cli_review_complete`
  - `cli_login`
  - `cli_logout`
  - `cli_feedback`
  - `cli_error`
- Uses a machine/client id from `~/.coderabbit/machine-id` or git global config `coderabbit.machineId`.
- For self-hosted usage, telemetry is disabled in observed code paths.

Observed endpoints:

```text
https://eu.i.posthog.com
https://us.i.posthog.com
https://eu-assets.i.posthog.com
https://us-assets.i.posthog.com
```

Feature/config endpoint:

```text
https://cli.coderabbit.ai/public-configs.json
```

The feedback command is feature-gated; if not enabled for the account it returns a not-enabled message.

## Effect TS Library Check

Question: does the CLI use the Effect TypeScript library?

Conclusion: no convincing evidence.

Checks performed against the binary:

- Searched for module references such as:
  - `@effect/*`
  - `effect/*`
  - `effect-ts`
- Searched for common Effect APIs:
  - `Effect.`
  - `Layer.`
  - `Context.`
  - `Exit.`
  - `Cause.`
  - `Fiber.`
  - `Schema.`

Only generic words such as "effect", "context", "schema", and "stream" appeared. These are common in Bun runtime, zod, UI strings, and prose. No `@effect` imports or Effect-style service/layer construction were found.

The repo in the current workspace may have its own dependencies, but this conclusion is about the installed `coderabbit` binary.

## Security and Privacy Notes

What the CLI sends during review:

- Diffs for changed files.
- Full content for changed files when readable.
- Config/instruction files such as `.coderabbit.yaml`.
- Remote URL and remote list.
- Current/base branch and commit ids.
- User/org/provider metadata.
- Previous review internal state and incremental diff data when present.

Sensitive local handling:

- OAuth tokens and PATs are intended to live in OS credential storage through `Bun.secrets`.
- API key auth path appears to store the API key in `auth.json`.
- Logs are JSON and may include operational metadata; token-like material should be treated carefully.

Operational risk:

- `coderabbit review` uploads local diff/file content to CodeRabbit.
- Running it on a repo with secrets in changed files or config files would expose them to the backend.
- Running on a repo without remote can still create a review but may use free allowance and not org attribution.

## Probe Review Findings

The controlled probe did the following:

```text
mkdir /tmp/coderabbit-probe
git init
commit a baseline index.js
modify index.js with synthetic SQL injection and hardcoded password examples
coderabbit review --agent --type uncommitted --light --base main --dir /tmp/coderabbit-probe
```

Observed output:

- `review_context`
- several `status` events
- two `finding` events
- final `complete` event

Observed findings:

```text
critical SECURITY_AND_PRIVACY index.js:1-4
SQL string concatenation from req.query.id

critical SECURITY_AND_PRIVACY index.js:6-7
hardcoded credential and insecure comparison
```

Observed prompt replay:

```text
coderabbit review --show-prompts --base main --dir /tmp/coderabbit-probe
```

This replayed the two `codegenInstructions` blocks stored in the local review session.

Observed storage:

```text
~/.coderabbit/reviews/179a707c/2d6ad78f/reviews/1783535353972/
  6221991a-2332-4700-af80-d8e2788d5fce.json
  831d7723-e5f4-41af-bce6-47a9c6abf41e.json
  diff.json
  git.json
  incrementalDiff.json
  internalState.json
```

Note: `coderabbit review findings --dir /tmp/coderabbit-probe` did not work correctly when run from the original workspace; it still inspected the current workspace. Running `coderabbit review findings` with working directory `/tmp/coderabbit-probe` did read the stored findings correctly. This looks like an option parsing or inherited option behavior worth remembering.

## Extracted Operational Details

These are smaller client-side design details recovered from the CLI binary. They are useful if re-designing a similar CLI because they capture reliability, integration, and UX choices that are easy to miss in a high-level architecture.

Review lifecycle:

- Each review receives a locally generated review id before WebSocket setup.
- Review start telemetry includes review id, review type, file count, total file count, whether previous state exists, whether an explicit API key was used, and config-file count.
- If the review is stopped by the user, the CLI calls `stopReview("user")`, closes the WebSocket subscription, clears the timeout, and emits telemetry `cli_review_stopped`.
- The review service suppresses late startup errors after a stop, so a user interrupt does not create a second misleading failure path.
- Review completion persists all in-memory review data, then emits completion and closes the review connection.

Output behavior:

- In plain mode, TTY output uses a spinner with an `80` ms frame interval.
- In non-TTY plain mode, it prints elapsed progress roughly every `60000` ms.
- The plain summary lists at most `10` reviewed files, then prints a remaining-file count.
- In agent mode, the CLI avoids rich terminal formatting and emits newline-delimited JSON for automation.

Review-skipped behavior:

- If there are no local changed files before contacting the backend, the CLI handles the skip locally.
- If the backend emits `review_skipped`, the CLI turns it into a review error message that includes the count of previous locally stored findings, and points the user at `coderabbit review findings --dir "<workingDirectory>"`.
- This implies CodeRabbit distinguishes "nothing to review locally" from "backend decided this review should be skipped".

Payload size behavior:

- Git diff collection has a client-side `20 MB` per-diff guard.
- The review service has a separate payload-too-large error category, which means the backend or transport can still reject a payload even after client-side diff truncation.

Incremental review behavior:

- The CLI saves backend `state_update` events to `internalState.json`.
- The next review sends `previousState` when present.
- The CLI also keeps `incrementalDiff.json`, which stores file payloads including full content for changed files.
- This supports incremental review without forcing the backend to infer all prior context from Git alone.

What this suggests for a reimplementation:

- Treat the CLI as an orchestrator with explicit local state, not as a stateless wrapper around an API.
- Separate agent output from human terminal output from the start.
- Preserve stable review ids and reject stale events.
- Keep local review artifacts structured enough to support prompt replay, finding display, suggestion application, stats rebuild, and incremental context.
- Put hard boundaries around path traversal, diff size, and review timeout in the client even if the backend also validates them.

## Local Mock Capture

To verify wire-facing behavior without sending code to CodeRabbit, a minimal local tRPC/WebSocket capture server was added:

```text
scripts/coderabbit-trpc-capture-server.mjs
```

The test used:

```text
HOME=/tmp/coderabbit-capture-home
CODERABBIT_HOST_URL=http://127.0.0.1:18765
CR_CLI_TELEMETRY_DISABLED=true
CODERABBIT_CLI_DISABLE_AUTO_UPDATE=true
coderabbit review --agent --type uncommitted --light --base main --dir /tmp/coderabbit-capture-probe --api-key fake-capture-key
```

The CLI completed successfully against the mock server:

```json
{"type":"review_context","reviewType":"uncommitted","currentBranch":"main","baseBranch":"main","workingDirectory":"/private/tmp/coderabbit-capture-probe"}
{"type":"status","phase":"connecting","status":"connecting_to_review_service"}
{"type":"status","phase":"analyzing","status":"reviewing","message":"mock server accepted review payload"}
{"type":"complete","status":"review_completed","findings":0,"reviewedFiles":["index.js",".coderabbit.yaml"]}
```

Captured WebSocket endpoint:

```text
/ws?connectionParams=1
```

Captured WebSocket headers in direct API-key mode:

```text
x-coderabbit-cli-clientid: cli/<machine-id>
x-coderabbit-cli-version: 0.6.5
x-coderabbit-client: cli
x-coderabbitai-api-key: <redacted>
```

Captured `extensionEvent` keys:

```text
userId
userName
email
clientId
eventType
reviewId
files
hostUrl
provider
providerUserId
remoteUrl
host
version
orgId
headCommitId
baseCommitId
cliReviewLight
cliReviewFast
allFiles
```

Captured file payload behavior:

- `files[]` contained `filename`, `diff`, `newFile`, `renamedFile`, `deletedFile`, and full `fileContent`.
- The default `.coderabbit.yaml` was included as a normal file payload. Because it was untracked in this probe, it also had a synthetic new-file diff.
- `allFiles[]` mirrored `files[]` on the first review with no previous incremental state.
- No HTTP requests were made during this direct `review --api-key` capture.

## Limitations

Cannot prove from the CLI alone:

- The backend's actual model provider.
- The backend's full review system prompt.
- The full tRPC router schemas.
- Backend data retention and processing internals.
- Whether server-side components use Effect or any other library.

Can prove or strongly infer:

- The CLI-side architecture and data flow.
- The tRPC procedure names used by the CLI.
- The payload shape sent to review backend.
- The streamed event/finding shape returned to the CLI.
- The local storage schema.
- The visible agent repair prompt surface.

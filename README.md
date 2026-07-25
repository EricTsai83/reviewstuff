# reviewstuff (work in progress)

Minimal Bun-powered CLI scaffold for reviewstuff.

## Repository configuration

Each selected Git working-tree repository may contain one optional
`.reviewstuff.yaml` at its root:

```yaml
review:
  preset: standard
  privacy: local-only
  engine: fake
  provider: fake
  model: fake-reviewer-v1
  timeoutMs: 120000
  concurrency: 2
```

`reviewstuff review`, nested-directory invocations, and `review --dir <path>`
all load configuration from the selected repository root. Missing, blank, and
comment-only files use defaults. Invalid YAML or unsupported fields fail
closed. `reviewstuff.config.json`, `.reviewstuff.yml`, and other aliases are
not loaded.

Precedence is `CLI flags > repository configuration > preset/built-in
defaults`.

`privacy` defaults to `local-only`. A cloud transport must be explicitly
enabled with `--privacy cloud-allowed` or `review.privacy: cloud-allowed`
before any repository data can be sent to it.

Before an engine receives a normalized review request, reviewstuff replaces
recognized API-key formats, private-key blocks, and bounded high-entropy tokens
with deterministic redaction markers. Redaction diagnostics contain only
reason/count metadata. This is a best-effort safeguard for obvious secrets, not
a guarantee that arbitrary sensitive data cannot leave the machine; review
diffs and configuration before enabling a cloud transport.

Use `reviewstuff review --dry-run-request` to inspect the normalized request
without invoking the selected engine or writing a review session. Add `--json`
to emit only that `ReviewRequestV1` JSON document, which makes it suitable for
machine inspection. The preview is the exact redacted, budget-selected request
passed to `ReviewEngine`; request-budget token counts are estimates, and a
provider adapter may add a provider-specific envelope that is outside this
normalized-request preview.

## Development

```bash
bun install
bun run typecheck
bun run build
./dist/reviewstuff --version
./dist/reviewstuff --help
```

The build produces a standalone macOS arm64 executable at `dist/reviewstuff`.

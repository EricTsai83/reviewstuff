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

## Development

```bash
bun install
bun run typecheck
bun run build
./dist/reviewstuff --version
./dist/reviewstuff --help
```

The build produces a standalone macOS arm64 executable at `dist/reviewstuff`.

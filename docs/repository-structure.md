# Repository structure

The source tree separates CLI concerns, application flow, domain rules, semantic service boundaries, and side effects. Commands invoke use-cases. Use-cases depend on semantic services such as `GitService` and `ReviewEngine`, never on low-level platform services. Live adapters translate external systems into domain-facing values and are the only feature code that may use controlled platform wrappers. Domain code never imports infrastructure.

| Directory | Ownership | Allowed source dependencies |
| --- | --- | --- |
| `commands/` | CLI command definitions, flags and arguments, usage errors, dispatch, renderer selection, and stdout/stderr writes | `use-cases/`, `output/`, `domain/`, `shared/` |
| `use-cases/` | Application workflows and orchestration through semantic service interfaces | `domain/`, semantic service interfaces in `git/`, `engines/`, `storage/`, `config/`, `languages/`, `analyzers/`, `fix/`, `agent/`, and pure policy in `review/`; never `platform/` or `output/` |
| `domain/` | Pure types, schemas, invariants, and domain rules | `shared/` only; no platform services or side effects |
| `git/` | `GitService` contract plus Git live/fake adapters | `domain/`, `platform/`, `shared/`; the service contract must not expose platform types |
| `engines/` | `ReviewEngine` contract plus provider live/fake adapters | `domain/`, `platform/`, `config/`, `shared/`; providers receive normalized requests and never read the repository |
| `review/` | Pure review policy, prompt construction, and request normalization introduced when first needed | `domain/`, `shared/`; no application flow or IO |
| `platform/` | Typed Effect services and controlled wrappers for process, filesystem, and time side effects | `shared/` and Effect platform packages |
| `output/` | Output models, formatting, and renderers shared by CLI entry points | `domain/`, `shared/` |
| `config/` | Configuration schemas, loading, and validation | `domain/`, `platform/`, `shared/` |
| `shared/` | Small, generally reusable types and pure helpers | no feature directory |

Future `storage/` code belongs beside `git/` and `engines/` as a semantic service boundary with live and fake adapters. Live adapters must execute process, filesystem, and time effects through controlled services in `platform/`, rather than accessing runtimes or globals directly. A use-case receives the semantic service through Effect dependency injection; it never receives `CommandRunner`, `FileSystem`, or provider SDK clients directly.

## Entry point and dependency rules

`cli.ts` is the only composition root. It assembles commands, supplies live adapter and platform layers, runs the CLI, and maps top-level failures to exit behavior. Runtime-specific imports belong here or in a platform live adapter. It should not contain command-specific application flow.

Commands translate parsed CLI input into a use-case invocation and render its typed result. A use-case never returns pre-rendered terminal text. Use-cases decide the sequence of application operations through semantic services. Domain and `review/` logic remain deterministic and independently testable. Adapter directories translate between external systems and domain-facing values, with all side effects delegated to `platform/` services.

Cross-feature imports should use the owning boundary's small public service or model module instead of reaching through adapter internals. The architecture test enforces the core dependency direction. Update that test deliberately when a new top-level capability is introduced; do not bypass it with deep imports or runtime escape hatches.

## Command execution boundary

`platform/command-runner.ts` owns the application port and stable request/result/error types. Every request must specify a timeout and maximum combined output size. A successful low-level execution returns stdout, stderr, and the numeric exit code; semantic adapters decide how an exit code maps to a Git, analyzer, or provider error.

The Bun live implementation is introduced with the first real subprocess use case. It must use `@effect/platform/Command.start`, consume stdout and stderr concurrently, enforce the output cap while streaming, interrupt and clean up the process on timeout or cancellation, and map platform failures into the `CommandRunner` error union. Feature adapters must never use `Command.string`, `child_process`, `Bun.spawn`, or shell command strings directly.

Only create a directory when its first real owner is implemented. The table describes the long-term dependency map; it is not a requirement to create speculative empty folders.

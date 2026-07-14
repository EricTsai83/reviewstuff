# Repository structure

The source tree separates CLI concerns, application flow, domain rules, semantic service boundaries, and side effects. Commands invoke use-cases. Use-cases depend on semantic services such as `GitService` and `ReviewEngine`, never on low-level platform services. Live adapters translate external systems into domain-facing values and are the only feature code that may use controlled platform wrappers. Domain code never imports infrastructure.

| Directory | Ownership | Allowed source dependencies |
| --- | --- | --- |
| `commands/` | CLI command definitions, flags and arguments, usage errors, dispatch, renderer selection, and stdout/stderr writes | `use-cases/`, `output/`, `domain/`, `shared/` |
| `use-cases/` | Application workflows and orchestration through semantic service interfaces | `domain/`, semantic service interfaces in `git/`, `engines/`, `storage/`, `config/`, `languages/`, `analyzers/`, `fix/`, `agent/`, and pure policy in `review/`; never `platform/` or `output/` |
| `domain/` | Stable domain models, versioned schemas, and invariants shared across application capabilities | `shared/` only; no platform services or side effects |
| `git/` | `GitService` contract plus Git live/fake adapters | `domain/`, `platform/`, `shared/`; the service contract must not expose platform types |
| `engines/` | `ReviewEngine` contract plus provider live/fake adapters | `domain/`, `platform/`, `config/`, `shared/`; providers receive normalized requests and never read the repository |
| `review/` | Review-specific pure policy, prompt construction, and request normalization introduced when first needed | `domain/`, `shared/`; no application flow or IO |
| `platform/` | Low-level Effect services and controlled wrappers for process, filesystem, and time side effects when application-level policy is required | `shared/` and runtime-agnostic Effect platform packages |
| `output/` | Output models, formatting, and renderers shared by CLI entry points | `domain/`, `shared/` |
| `config/` | Configuration schemas, loading, and validation | `domain/`, `platform/`, `shared/` |
| `shared/` | Small, ownerless types and pure helpers used by multiple unrelated source areas | no feature directory |

Future `storage/` code belongs beside `git/` and `engines/` as a semantic service boundary with live and fake adapters. Live adapters must execute process, filesystem, and time effects through controlled services in `platform/`, rather than accessing runtimes or globals directly. A use-case receives the semantic service through Effect dependency injection; it never receives `CommandRunner`, `FileSystem`, or provider SDK clients directly.

`domain/` owns models and invariants that are stable across capabilities, such as findings, reports, and review scope. `review/` owns pure behavior specific to producing a review, such as prompt construction and review policy. Capability-specific schemas stay with their owner: configuration schemas belong to `config/`, while serialized output contracts belong to `output/` or the domain model they expose. Do not create `review/` merely to relocate a small helper that already has a clear owner.

Within a semantic service directory, keep the service contract and models separate from live adapter internals. Contract and model modules must not import `platform/` or expose platform types; live adapter modules may depend on `platform/`, and fake adapters should normally remain platform-independent. Add file-level architecture checks when the first live adapter makes these conventions enforceable.

`shared/` is not a dependency-rule escape hatch. Keep a type or helper with its owning capability unless it is pure, has no natural feature owner, and is used by multiple unrelated source areas.

## Entry point and dependency rules

`cli.ts` is the only runtime entry point and composition root. It assembles commands, supplies live adapter and platform layers, runs the CLI, and maps top-level failures to exit behavior. Layer construction may be factored into dedicated root-level or platform composition modules as the graph grows, but those modules must not start another runtime. It should not contain command-specific application flow.

Under the current Bun-first design, `@effect/platform-bun` and Bun runtime globals belong only in the composition root. Platform services and live adapters use runtime-agnostic `@effect/platform` interfaces, with `cli.ts` providing `BunContext.layer`. If a future platform adapter genuinely requires a runtime-specific escape hatch, document the reason and deliberately update the architecture rule rather than bypassing it.

Commands translate parsed CLI input into a use-case invocation and render its typed result. A use-case never returns pre-rendered terminal text. Use-cases decide the sequence of application operations through semantic services. Domain and `review/` logic remain deterministic and independently testable. Adapter directories translate between external systems and domain-facing values, with all side effects delegated to `platform/` services.

Cross-feature imports should use the owning boundary's small public service or model module instead of reaching through adapter internals. The architecture test enforces the core dependency direction. When a future top-level capability such as `storage/`, `agent/`, `analyzers/`, `languages/`, `fix/`, or `release/` is first introduced, add its ownership and allowed dependencies to this table and register the same boundary in the architecture test. Do not bypass the rule with deep imports or runtime escape hatches.

## Platform abstraction rule

Prefer existing `@effect/platform` services for filesystem, path, clock, and similar primitives. Add an application-owned wrapper only when it contributes a real policy or stable error vocabulary, rather than forwarding the underlying API unchanged. Examples include an atomic file writer, a size-limited reader, or `CommandRunner` with mandatory timeout, output limits, and cleanup behavior. Semantic adapters remain responsible for translating those low-level results into Git, provider, storage, or analyzer errors.

## Command execution boundary

`platform/command-runner.ts` owns the low-level platform service contract and stable request/result/error types. Every request must specify a timeout and maximum combined output size. A successful low-level execution returns stdout, stderr, and the numeric exit code; semantic adapters decide how an exit code maps to a Git, analyzer, or provider error.

The Bun live implementation is introduced with the first real subprocess use case. It must use `@effect/platform/Command.start`, consume stdout and stderr concurrently, enforce the output cap while streaming, interrupt and clean up the process on timeout or cancellation, and map platform failures into the `CommandRunner` error union. Feature adapters must never use `Command.string`, `child_process`, `Bun.spawn`, or shell command strings directly.

Only create a directory when its first real owner is implemented. The table records the boundaries defined so far; future areas join it when their first real implementation establishes an owner and dependency rule.

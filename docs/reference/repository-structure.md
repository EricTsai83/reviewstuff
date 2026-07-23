# Repository structure

The source tree separates CLI concerns, application flow, domain rules, semantic service boundaries, and side effects. Commands invoke use-cases. Use-cases depend on semantic services such as `GitService` and `ReviewEngine`, never on low-level platform services. Concrete implementations translate external systems into domain-facing values and are the only feature code that may use controlled platform wrappers. Domain code never imports infrastructure.

| Directory | Ownership | Allowed source dependencies |
| --- | --- | --- |
| `commands/` | CLI command definitions, flags and arguments, usage errors, dispatch, renderer selection, and stdout/stderr writes | `use-cases/`, `output/`, `domain/`, `shared/` |
| `use-cases/` | Application workflows and orchestration through semantic service interfaces | `domain/`, semantic service interfaces in `git/`, `engines/`, `storage/`, `config/`, `languages/`, `analyzers/`, `fix/`, `agent/`, and pure policy in `review/`; never `platform/` or `output/` |
| `domain/` | Stable domain models, versioned schemas, and invariants shared across application capabilities | `shared/` only; no platform services or side effects |
| `git/` | `GitService` contract and its canonical Git-backed implementation | `domain/`, `platform/`, `shared/`; the public service contract must not expose platform types |
| `engines/` | `ReviewEngine` contract plus provider-specific implementations such as `OpenAiReviewEngine` or `CodexCliReviewEngine` | `review/`, `domain/`, `platform/`, `config/`, `shared/`; providers receive normalized requests and never read the repository |
| `review/` | Review-specific pure policy, prompt construction, and request normalization introduced when first needed | `domain/`, `shared/`; no application flow or IO |
| `platform/` | Low-level Effect services and controlled wrappers for process, filesystem, and time side effects when application-level policy is required | `shared/` and runtime-agnostic Effect 4 platform modules |
| `output/` | Output models, formatting, and renderers shared by CLI entry points | `domain/`, `shared/` |
| `config/` | Configuration schemas, loading, and validation | `domain/`, `platform/`, `shared/` |
| `shared/` | Small, ownerless types and pure helpers used by multiple unrelated source areas | no feature directory |

Future `storage/` code belongs beside `git/` and `engines/` as a semantic service boundary. Concrete implementations must execute process, filesystem, and time effects through controlled services in `platform/`, rather than accessing runtimes or globals directly. A use-case receives the semantic service through Effect dependency injection; it never receives `CommandRunner`, `FileSystem`, or provider SDK clients directly.

`domain/` owns models and invariants that are stable across capabilities, such as findings, reports, and review scope. `review/` owns pure behavior specific to producing a review, such as prompt construction and review policy. Capability-specific schemas stay with their owner: configuration schemas belong to `config/`, while serialized output contracts belong to `output/` or the domain model they expose. Do not create `review/` merely to relocate a small helper that already has a clear owner.

## Service module organization

Organize files by capability rather than by framework role. Do not create generic `Services/`, `Layers/`, or `live.ts` paths.

- When a service has one canonical production implementation, keep its tag, public types, constructor, and production layer in one capability-named module, such as `platform/command-runner.ts` or `git/git-service.ts`.
- When a service has multiple real production implementations, keep the shared contract in one module and give every implementation a concrete name, such as `engines/review-engine.ts`, `engines/openai-review-engine.ts`, and `engines/codex-cli-review-engine.ts`.
- A test fake does not by itself justify a production adapter hierarchy. Keep test-only layers beside their tests unless they are reusable test infrastructure.
- Reserve `Live` for a composed production dependency graph such as `AppLive`. A module-level layer should normally be exported as `layer`, for example `CommandRunner.layer` when imported as a namespace.

A single canonical module may import `platform/` internally, but its exported service contract must not expose platform types. Provider-specific modules may also depend on `platform/`; `ReviewEngine` consumers still see only normalized domain-facing input and output.

Source declarations follow the project-wide contract-first and composition-last
convention documented in [原始碼檔案排版規範](../learning/source-file-layout.html).

`shared/` is not a dependency-rule escape hatch. Keep a type or helper with its owning capability unless it is pure, has no natural feature owner, and is used by multiple unrelated source areas.

## Entry point and dependency rules

`cli.ts` is the only runtime entry point and composition root. It assembles commands, supplies the composed production graph (`AppLive`) and runtime layers, runs the CLI, and maps top-level failures to exit behavior. Layer construction may be factored into a dedicated root-level composition module as the graph grows, but that module must not start another runtime. The entry point should not contain command-specific application flow.

Under the current Bun-first design, `@effect/platform-bun` and Bun runtime globals belong only in the composition root. Platform and concrete adapter modules use runtime-agnostic Effect 4 services such as `effect/FileSystem`, `effect/Path`, and `effect/unstable/process`, with `cli.ts` providing `BunServices.layer`. If a future implementation genuinely requires a runtime-specific escape hatch, document the reason and deliberately update the architecture rule rather than bypassing it.

Commands translate parsed CLI input into a use-case invocation and render its typed result. A use-case never returns pre-rendered terminal text. Use-cases decide the sequence of application operations through semantic services. Domain and `review/` logic remain deterministic and independently testable. Adapter directories translate between external systems and domain-facing values, with all side effects delegated to `platform/` services.

Cross-feature imports should use the owning boundary's small public service or model module instead of reaching through adapter internals. The architecture test enforces the core dependency direction. When a future top-level capability such as `storage/`, `agent/`, `analyzers/`, `languages/`, `fix/`, or `release/` is first introduced, add its ownership and allowed dependencies to this table and register the same boundary in the architecture test. Do not bypass the rule with deep imports or runtime escape hatches.

## Platform abstraction rule

Prefer existing Effect 4 services for filesystem, path, clock, and similar primitives. Add an application-owned wrapper only when it contributes a real policy or stable error vocabulary, rather than forwarding the underlying API unchanged. Examples include an atomic file writer, a size-limited reader, or `CommandRunner` with mandatory timeout, output limits, and cleanup behavior. Semantic adapters remain responsible for translating those low-level results into Git, provider, storage, or analyzer errors.

## Command execution boundary

`platform/command-runner.ts` owns the low-level platform service contract and stable request/result/error types. Every request must specify a timeout and maximum combined output size. A successful low-level execution returns stdout, stderr, and the numeric exit code; semantic adapters decide how an exit code maps to a Git, analyzer, or provider error.

The canonical implementation is added to `platform/command-runner.ts` with the first real subprocess use case. It must use `effect/unstable/process/ChildProcess`, consume stdout and stderr concurrently, enforce the output cap while streaming, interrupt and clean up the process on timeout or cancellation, and map platform failures into the `CommandRunner` error union. Feature adapters must never use `ChildProcess` directly, `child_process`, `Bun.spawn`, or shell command strings.

Only create a directory when its first real owner is implemented. The table records the boundaries defined so far; future areas join it when their first real implementation establishes an owner and dependency rule.

# Effect review rules

## Contents

1. Review scope and authority
2. Project service model
3. Imports and module boundaries
4. Service definition and construction
5. Dependency acquisition and runtime boundaries
6. Layers and resource ownership
7. Typed errors and recovery
8. Error safety and observability
9. Migrations and tests
10. Non-findings

## 1. Review scope and authority

- Review changed TypeScript and directly affected call sites. Follow a service far enough to validate its tag, constructor, layer, consumers, composition, errors, and tests.
- Apply these rules when a change creates, moves, refactors, provides, or consumes an Effect service. Do not request unrelated legacy cleanup.
- Read local architecture rules first. When they conflict with a generic preference, the local rule wins.
- Check the installed Effect source when an API or semantic detail is uncertain. This repository caches dependency source under `~/.opensrc/`; use `opensrc path effect` rather than relying on memory.
- Judge behavior and dependency truthfulness, not resemblance to one preferred snippet.

## 2. Project service model

- Organize source by capability, not DI role. Do not introduce generic `Services/`, `Layers/`, `service.ts`, `layer.ts`, `adapter.ts`, `live.ts`, or `*-live.ts` paths.
- For one canonical production implementation, keep the tag, public types, `make`, and `layer` in one capability-named module.
- For multiple real production implementations, keep the shared port in a capability module and use concrete implementation names such as `OpenAiReviewEngine` and `CodexCliReviewEngine`.
- A test fake alone does not justify a production adapter hierarchy. Keep test implementations beside tests unless they are reusable test infrastructure.
- Reserve `Live` for a composed application graph such as `AppLive`. A service module normally exports `layer`.
- Keep platform types out of semantic service contracts even when the canonical implementation lives in the same module.

The current project uses Effect 3 and `Context.Tag`. Do not require a nonexistent `Context.Service` export or migrate to experimental `Effect.Service` solely for visual uniformity.

Prefer an inline service shape and its inferred type:

```ts
export class CommandRunner extends Context.Tag("reviewstuff/CommandRunner")<
  CommandRunner,
  {
    readonly run: (
      request: CommandRequest,
    ) => Effect.Effect<CommandResult, CommandExecutionError>
  }
>() {}

type Service = CommandRunner["Service"]
```

Flag a standalone `FooShape`, `FooServiceShape`, or `FooService` type when it merely duplicates the tag's service shape. Do not flag a distinct public domain model.

## 3. Imports and module boundaries

- At a service boundary, prefer importing the local capability module as a namespace when callers use its tag, `make`, or `layer`: `CommandRunner.CommandRunner`, `CommandRunner.make`, and `CommandRunner.layer`.
- When a barrel exposes a whole service module, prefer `export * as CommandRunner from "./command-runner"` over separately renamed `make` and `layer` exports.
- Keep named imports for whole packages and for modules used only for a pure helper, schema, error, config value, or standalone type. Do not request namespace imports indiscriminately.
- Effect subpath namespace imports such as `import * as Effect from "effect/Effect"` are acceptable and may become a repository formatting rule, but consolidated imports from `"effect"` are not a blocking review finding until this repository explicitly adopts that policy.
- Flag deep imports that bypass the capability's public boundary or expose implementation details to use-cases.

## 4. Service definition and construction

- Keep a predictable order in a canonical service module: imports, domain models and errors, tag with inline service shape, `make`, then `layer`. Treat ordering alone as non-blocking unless it obscures ownership or duplicates APIs.
- Export a real `make` when the module owns construction. Do not create `make = Effect.succeed(...)` only to force `Layer.effect`.
- Export the canonical production layer as `layer`. Choose `Layer.succeed`, `Layer.effect`, `Layer.scoped`, or another constructor based on the actual construction and lifecycle.
- In a concretely named implementation module, use plain `make` and `layer`. In an abstract port containing multiple implementations, implementation-specific names may be appropriate.
- Do not add pass-through wrappers around existing `@effect/platform` services unless the wrapper contributes real application policy, such as timeout, output caps, cleanup, atomicity, or a stable error vocabulary.
- Preserve useful comments, invariants, and domain documentation when moving service code.

## 5. Dependency acquisition and runtime boundaries

- A production service must acquire owned Effect service dependencies from the environment with `yield* Dependency`. Its `make` and `layer` types must expose those requirements.
- Flag a production factory accepting `Foo["Service"]`, or a plain object whose methods return Effect, when `Foo` is an implementation dependency owned by the constructed service.
- Allow explicit service instances in tests and integration harnesses.
- Allow constructor parameters for pure configuration, immutable domain values, already acquired external handles whose ownership is explicit, and deliberate callback strategies that are not disguised service bags.
- Do not hide dependencies in module globals, singleton closures, ambient runtimes, or helper modules that secretly retrieve live implementations.
- Keep `ManagedRuntime.make`, `runPromise`, `runPromiseExit`, `runSync`, and equivalent execution at explicit boundaries: the CLI entry point, framework/native/HTTP callback adapters, and tests.
- A clearly named imperative adapter may expose an Effect program as a Promise API, but another Effect service must not depend on that imperative adapter.
- Do not create per-feature managed runtimes or Atom runtimes to share the same owned resource. Compose the resource once in `AppLive` or another application-owned graph and provide its context to integrations.
- When service acquisition can fail but fallback is required, keep unavailability typed in Effect or provide an explicit optional-service layer. Do not bypass the layer with an imperative runtime.

## 6. Layers and resource ownership

- Use `Layer.succeed` only for a static service value whose construction needs no Effect dependency, acquisition, finalizer, or runtime-backed singleton.
- A service object created synchronously may still return Effects from its methods. This is valid when those methods describe their side effects and do not close over hidden live services or unmanaged resources.
- Use `Layer.effect` when construction performs an Effect or acquires dependencies without a finalizer.
- Use `Layer.scoped` or an equivalent scoped constructor when construction acquires a resource that must be released.
- Verify that subprocesses, files, streams, temporary directories, connections, and workers remain interruptible and release resources on success, failure, timeout, output-limit failure, and cancellation.
- Ensure the composition root provides each owned resource once and exposes the resulting service graph without starting a second runtime.

## 7. Typed errors and recovery

- Model expected failures as tagged errors in the Effect error channel. Use `Data.TaggedError` for process-local typed failures; use `Schema.TaggedErrorClass` when the value is serialized, persisted, transported, or needs a schema. Do not require Schema solely for uniformity.
- Give failures stable structural fields such as operation, path/resource identifier, entity, normalized category/status, and safe lengths or counts.
- Preserve the immediate underlying failure as `cause` when translating a real failure. Make `cause` optional only when the same error can legitimately originate without one.
- Derive `message` only from stable structural fields. Never derive it from `cause`, `cause.message`, a stringified defect, command output, or a raw remote response.
- Pass through an already structured error when it belongs to the declared target error channel. Wrap only unknown or lower-level failures.
- Preserve caller-visible messages during structural refactors. HTTP/RPC responses, persisted state, CLI output, and UI messages are behavior.
- Split semantically distinct failures into separate tagged classes when the distinction selects caller behavior or user-facing messages. Use a discriminator field when it is genuinely diagnostic or represents multiple values with shared semantics.
- Do not encode the same distinction twice with both a specific tag and a singleton `operation`, `kind`, `phase`, or `reason` field.
- Prefer `Schema.Union` when serialized error classes need a shared schema or predicate.
- Export direct predicates such as `export const isFoo = Schema.is(Foo)` rather than wrapping an identical private predicate in a function.
- Use `Effect.catchTags` for a known tagged union. `catchTag` is acceptable for one tag unless a local rule standardizes on `catchTags`. Use `catchIf` for genuinely structural predicates, such as an underlying platform error code, not as a substitute for tagged recovery.
- Avoid helpers whose only behavior is `new SomeError(args)`. Construct one-off errors at the failure boundary. Keep a mapper or static factory only when it performs reusable classification, normalization, pass-through, or context enrichment.

## 8. Error safety and observability

- Treat command arguments, stdout/stderr, repository content, prompts, model responses, wire payloads, signed URLs, credentials, tokens, query strings, fragments, selectors, and arbitrary defect text as sensitive or unbounded.
- Do not copy those values into `message`, `detail`, `reason`, log annotations, metrics labels, persisted findings, or parallel serialized fields.
- Keep the exact underlying value only as `cause` when necessary. Log a sanitized structural error; do not serialize or log its raw cause beside it.
- Prefer normalized categories plus bounded diagnostics: protocol/hostname, status class, byte length, item count, exit code, timeout, and configured output limit.
- Verify that error translation happens where safe context is known. Avoid wrapping an entire multi-step pipeline in one generic error that loses the failing stage.

## 9. Migrations and tests

- Delete obsolete service/layer files after a move. Do not leave compatibility re-export shims unless external package compatibility is an explicit requirement.
- Update every affected consumer: use-cases, commands, composition, barrels, tests, fixtures, integration harnesses, and documentation examples that are part of the maintained contract.
- Keep service-cleanup changes mechanical. Do not redesign orchestration or provider behavior without a requirement.
- Do not add large tests for import-only or mechanical type changes.
- Require focused tests when behavior, error mapping, fallback, resource cleanup, timeout, cancellation, output limits, serialization, or caller-visible messages change.
- Use test implementations for external services; do not mock away the core business logic being reviewed.

## 10. Non-findings

Do not report the following by themselves:

- `Layer.succeed` for a pure/static implementation.
- `runPromise` or `runSync` in a test or explicit application boundary.
- Passing a service implementation explicitly in a test harness.
- Passing pure configuration, immutable domain values, or a deliberate strategy callback.
- A separate concretely named implementation module when multiple production implementations exist.
- `Data.TaggedError` for an internal, non-serialized failure.
- `catchTag` for a single known tagged failure.
- Consolidated imports from `"effect"` while that remains the repository's existing style.
- Missing new tests for an import-only or mechanical migration with no behavior change.
- Legacy violations outside the changed and directly affected scope.

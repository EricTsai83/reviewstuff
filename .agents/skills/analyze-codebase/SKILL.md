---
name: analyze-codebase
description: Analyze an existing repository from user and business scenarios outward, trace each scenario through implemented entry points, runtime wiring, domain rules, data models, integrations, failures, and operations, and present durable findings as one polished standalone HTML report. Use when Codex needs to explain an unfamiliar system from the user's perspective, reverse-engineer an undocumented codebase, create scenario-led system-design documentation under a project's docs tree, trace a business workflow across layers, or assess architecture, coverage, and technical risks across a repository or monorepo.
---

# Analyze Codebase

Explain the implemented system from the outside in:

```text
actor and goal
→ user-visible scenario
→ system response
→ implementation path
→ domain and data effects
→ failures and recovery
```

Treat source, runtime wiring, configuration, schemas, migrations, and executable tests as evidence. Distinguish verified behavior from design intent and inference.

## Operating rules

- Keep application source read-only unless the user separately asks for changes.
- Create or update one standalone HTML system-design report when the request asks for whole-system analysis, documentation, or a durable deliverable. Keep the result in chat when the user asks for chat-only analysis, and honor an explicit request for another output format.
- Read and follow repository instructions such as `AGENTS.md`, `CONTRIBUTING.md`, and documentation indexes before analysis.
- Prefer repository-local evidence over generic framework assumptions.
- Cite important findings with file paths, symbols, and useful line numbers.
- Do not equate a file or service existing with it being reachable at runtime.
- Do not claim exhaustive coverage without showing what was and was not traced.
- Do not start servers, run builds, mutate databases, or contact production services merely to understand the system.
- Use safe static inspection first. Run targeted tests, typechecks, or other non-mutating checks only when they materially resolve uncertainty and repository instructions allow them.

## Choose the analysis depth

Infer the depth from the request:

- **Focused scenario**: Explain one user goal or business workflow end to end.
- **Scenario overview**: Catalog the system's main actors and scenarios, then trace representative scenarios across the architecture.
- **Comprehensive system design**: Document all material user, operator, external-system, and scheduled scenarios; all runtime units; major domains; stores; integrations; and cross-cutting concerns.

When unspecified, use a scenario overview. For large repositories, work breadth-first and show sampling or exclusions. Do not read every file linearly.

## Workflow

### 1. Establish repository and documentation scope

Determine:

- repository and workspace boundaries;
- applications, packages, services, libraries, infrastructure, generated code, and vendored code;
- primary languages, frameworks, package managers, and deployment targets;
- worktree changes that belong to the user;
- the existing documentation root, taxonomy, naming rules, format, and indexes.

Start with `rg --files`, targeted `find`, manifest inspection, and relevant top-level documents. Examine workspace definitions, dependency manifests and lockfiles, language configs, container files, infrastructure definitions, CI workflows, and top-level documentation.

Exclude generated, build-output, cache, dependency, fixture, and vendored directories unless directly relevant. Record exclusions.

Before creating documentation, read [references/documentation-layout.md](references/documentation-layout.md) and apply its destination and single-file rules.

### 2. Discover actors and business capabilities

Identify who or what initiates behavior:

- end users and user roles;
- administrators, support staff, and operators;
- external systems and webhook callers;
- scheduled jobs, queues, and other automated actors.

Infer capabilities from user-facing routes, screens, commands, public APIs, test names, help text, schemas, and reachable handlers. Use product language rather than folder names.

Do not invent business intent. Mark an actor, goal, or capability as inferred when only technical evidence supports it.

### 3. Build the scenario catalog

Group technical entry points into user-meaningful goals. Prefer scenarios such as “review staged changes” or “approve a refund” over names such as `POST /v1/action`.

For each scenario, record:

- actor and goal;
- trigger and preconditions;
- user-visible happy path;
- alternative, denied, failed, retry, cancellation, and recovery paths;
- successful outcome and observable result;
- entry point and downstream capability;
- confidence and primary evidence.

Include system-initiated behavior when it materially affects users. Describe it as an operator, external-system, or scheduled scenario rather than pretending an end user initiated it.

Prioritize:

1. the system's primary value-producing scenario;
2. important mutations and state transitions;
3. important reads or queries;
4. privileged or administrative actions;
5. asynchronous and integration-driven work;
6. high-impact failure and recovery paths.

### 4. Build the breadth-first system map

Identify runtime units and their relationships:

- web, desktop, mobile, or CLI clients;
- API servers and backend applications;
- workers, schedulers, queue consumers, and event processors;
- shared packages and internal libraries;
- databases, caches, object stores, queues, and external providers;
- deployment-time composition and service wiring.

For each runtime unit, locate its startup entry, composition root, configuration source, dependencies, owned data, and exposed interfaces.

Use the map to explain what supports the scenarios; do not make the directory tree the narrative.

### 5. Verify entry points and runtime reachability

Inventory applicable entry-point categories:

- page and UI routes;
- HTTP, RPC, GraphQL, or server-action handlers;
- webhooks;
- queue and event consumers;
- scheduled jobs;
- CLI commands;
- file importers;
- framework lifecycle hooks and background workers.

For important components, confirm:

```text
declared → exported → registered/provided → selected by configuration → invoked
```

Inspect composition roots, dependency injection or layer construction, router registration, event subscriptions, job schedules, feature flags, and environment branches. Classify code that is present but not demonstrably wired as dormant or uncertain.

### 6. Trace each selected scenario end to end

Begin with plain user-visible steps. Then map every step to the implementation:

```text
user action or external trigger
→ authentication and authorization
→ input decoding and validation
→ application/use-case orchestration
→ domain decisions and state transitions
→ persistence and transaction boundary
→ events, queues, and external side effects
→ output and user-visible result
→ failure handling, retry, cancellation, or compensation
```

Record concrete symbols and files at each hop. Follow actual call chains and runtime wiring rather than directory naming conventions.

For each scenario, answer:

- What does the actor experience?
- Which system boundary receives the action?
- Which rules decide whether it may proceed?
- What state changes, and who owns that state?
- Which other systems are contacted?
- What is atomic, eventually consistent, retried, or compensating?
- What does failure look like to the actor, and can they safely try again?

Read and use [references/scenario-template.md](references/scenario-template.md) when structuring the report.

### 7. Reconstruct domain and data models

Extract:

- central business concepts and ownership;
- entities, value objects, aggregates, and identifiers where present;
- invariants and business rules;
- lifecycle states and allowed transitions;
- commands, events, and read models;
- authorization rules and actor boundaries;
- schemas, tables or collections, relations, indexes, migrations, and retention behavior.

Relate every important domain concept back to the scenarios that use or change it. Compare types and domain objects with persistence schemas. Note duplicated concepts, implicit rules, and mismatches between layers.

### 8. Analyze cross-cutting behavior

Inspect how the system handles:

- configuration, secrets, and feature flags;
- authentication and authorization;
- input validation and output encoding;
- typed errors, exception mapping, and user-visible failures;
- transactions and consistency boundaries;
- concurrency, idempotency, retries, timeouts, and compensation;
- caching and invalidation;
- logging, metrics, tracing, and audit trails;
- privacy and sensitive data;
- testing strategy and dependency substitution.

Explain these concerns through their effect on scenarios. Prioritize behavior that changes correctness, user experience, or operational risk.

### 9. Triangulate evidence and confidence

Use evidence in this order:

1. runtime wiring and executable implementation;
2. schemas, migrations, configuration, and infrastructure;
3. tests that exercise behavior;
4. documentation and comments;
5. names or framework convention alone.

When sources disagree, report the disagreement.

Apply confidence labels:

- **Verified**: Directly supported by reachable implementation or runtime wiring, preferably corroborated by tests or schema.
- **Supported**: Multiple consistent clues exist, but a full execution chain was not established.
- **Inferred**: Plausible interpretation from structure or naming.
- **Unknown**: Evidence is missing, inaccessible, configuration-dependent, or contradictory.

### 10. Assess design, risk, and coverage

Separate factual reconstruction from evaluation. Tie material risks to an affected scenario, evidence, impact, and confidence.

Look for:

- unclear ownership or cyclic dependencies;
- business logic duplicated across entry points;
- domain rules enforced only in UI or adapters;
- hidden global state or configuration coupling;
- transaction gaps and partial-failure hazards;
- unsafe retry or missing idempotency;
- authorization inconsistencies;
- schema and type drift;
- dead or ambiguously wired paths;
- weak observability at critical boundaries;
- tests that omit high-risk state transitions.

Maintain a coverage ledger containing:

- actors and capabilities found;
- scenarios found, traced, sampled, or excluded;
- runtime units and entry-point categories inspected;
- stores and integrations inspected;
- excluded directories or artifacts;
- unresolved questions.

For a comprehensive request, do not stop after one representative scenario.

## Produce the documentation

For durable system-design output:

1. Select the destination using [references/documentation-layout.md](references/documentation-layout.md).
2. Read [references/html-report.md](references/html-report.md) and produce one independently readable, self-contained `.html` file.
3. Write the overview and scenario catalog before implementation-oriented architecture sections.
4. Keep detailed scenarios in the same file with stable section IDs and a linked table of contents.
5. Use relative source links and update an existing documentation index when the repository convention requires it.
6. Populate the scenario template with findings; do not copy an empty template into the project.
7. Render or open the finished HTML, inspect it at desktop and narrow viewport widths, and correct readability, overflow, navigation, and print-layout problems.
8. Run repository-provided HTML validation when available. Otherwise perform at least a structural check for a doctype, language, charset, title, semantic `main`, unique IDs, valid internal links, and missing local assets.
9. Preserve unrelated documents and user changes.

Lead with what users can accomplish and how the system behaves. Present architecture, modules, domain types, and infrastructure as explanations of how those scenarios are implemented.

Do not create an intermediate Markdown report unless the user requests it. The
HTML file is the canonical deliverable, not a generated wrapper around a
separate Markdown source.

In the final response:

- link every created or updated document;
- summarize the actors and scenarios covered;
- state coverage, exclusions, and material unknowns;
- distinguish existing behavior from recommendations;
- avoid presenting a directory inventory as a system-design explanation.

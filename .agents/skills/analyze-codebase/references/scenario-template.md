# Scenario-Led HTML Report Content Template

Adapt this content structure to the repository and implement it with semantic
HTML according to [html-report.md](html-report.md). Omit irrelevant sections
and never fill gaps with speculation.

## Contents

- [Single-file report](#single-file-report)
- [Detailed scenario](#detailed-scenario)

## Single-file report

Use one `<main>` containing the following sections. Give every navigable
section a stable, descriptive `id`.

### 1. What users can accomplish

Explain the system's purpose in product language:

- primary users or callers;
- their main goals;
- the outcomes the system produces;
- important limitations visible to users.

### 2. Actors

Present actors as an accessible table with columns for actor, goal,
capabilities, restrictions, and confidence.

Include end users, privileged roles, operators, external systems, and scheduled actors when relevant.

### 3. Scenario catalog

Present the catalog as an accessible table with columns for scenario, actor,
trigger, successful outcome, implementation entry, and confidence. Link each
scenario name to its detailed section in the same HTML file.

### 4. User-to-system overview

Show how user goals relate to runtime units, domains, stores, and integrations. Prefer a small diagram when one scenario crosses several boundaries.

### 5. Architecture supporting the scenarios

Explain:

- runtime units and composition roots;
- module or capability boundaries;
- dependency direction;
- shared services;
- stores, queues, and external systems.

Tie each component to scenarios instead of listing directories.

### 6. Domain and data design

Explain:

- central concepts and ownership;
- business invariants;
- state transitions;
- authorization boundaries;
- schemas and relations;
- transaction and consistency boundaries.

### 7. Cross-cutting behavior

Cover only relevant concerns:

- authentication and authorization;
- validation and error mapping;
- retries, idempotency, timeouts, and compensation;
- configuration and feature flags;
- logging, metrics, tracing, and audit;
- privacy and security;
- testing strategy.

Explain how each concern changes a scenario's behavior.

### 8. Findings and risks

Present findings in an accessible table with columns for finding, affected
scenario, evidence, impact, confidence, and recommendation. Visually
distinguish verified behavior from recommendations without relying on color
alone.

### 9. Coverage and unknowns

Present coverage in an accessible table with columns for area, inspected
surface, evidence depth, and remaining gap.

List excluded artifacts, sampled paths, configuration-dependent behavior, contradictions, and unanswered questions.

## Detailed scenario

Use this structure for each substantial scenario inside its own `<section>`.

### Scenario: `<actor verb object>`

#### User perspective

- **Actor:** Who initiates the scenario?
- **Goal:** What outcome are they trying to achieve?
- **Trigger:** What starts the scenario?
- **Preconditions:** What must already be true?
- **Success result:** What can the actor observe when it succeeds?

#### User-visible flow

Describe the happy path in product language before mentioning implementation:

1. The actor performs an action.
2. The system validates or responds.
3. The actor sees or receives the result.

#### System implementation

Use an accessible table with columns for user-visible step, system behavior,
entry/use case, domain and data effect, side effect, and evidence.

Trace actual runtime wiring. Include authentication, authorization, validation, orchestration, persistence, external calls, and output mapping where applicable.

#### Decisions and business rules

Use an accessible table with columns for decision or rule, accepted outcome,
rejected outcome, owner, and confidence.

#### State transitions

Use an accessible table with columns for from-state, trigger, guard, to-state,
and side effects.

Omit this section if the scenario has no meaningful lifecycle state.

#### Alternative and failure paths

Explain denied access, invalid input, conflicts, partial failures, timeouts, retry, cancellation, compensation, and user recovery. State whether repeating the action is safe.

#### Dependencies

List stores, queues, runtime services, and external systems required by this scenario. Explain failure behavior rather than only naming dependencies.

#### Evidence and confidence

Summarize:

- primary source files and symbols;
- corroborating schemas or tests;
- confidence label;
- assumptions and unknowns.

#### Related scenarios

Link prerequisite, follow-up, inverse, administrative, and recovery scenarios
with internal fragment links.

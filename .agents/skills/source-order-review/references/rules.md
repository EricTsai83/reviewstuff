# Source Order Rules

Use these rules as strong defaults, not a syntax sorter. Preserve semantic correctness and meaningful locality over visual uniformity.

## Core Reading Direction

Prefer this high-level order when the module shape supports it:

1. Imports
2. Public contracts: exported domain types, errors, schemas when public, and service tags
3. Shared private details used across one conceptual section or the whole module
4. Construction and main operations
5. Final composition: layers, root commands, or runtime invocation

"Public contracts first" does not mean every export goes first. An exported use-case, renderer, command, or layer can be final composition and therefore belong near the bottom.

## Place Private Declarations by Consumer Scope

| Consumer scope | Preferred placement |
| --- | --- |
| One function or component | Immediately before that consumer |
| One small group of operations | At the start of that conceptual group |
| Most of the module | In a shared private section after public contracts |
| Derived from a Schema | Adjacent to the Schema |

Lift a declaration only to the smallest section that contains all of its consumers. Do not create a top-of-file warehouse for unrelated private types, helpers, or constants.

Keep a declaration before its consumer unless doing so would split a stronger conceptual pair or group. Judge locality by whether a reader can understand the dependency without leaving the current concept, not by a fixed line-distance limit.

## Module Templates

### Effect service

For a capability module with one primary implementation, prefer:

```text
imports
→ public domain contracts and service tag
→ shared or consumer-local private declarations
→ make
→ layer
```

Within an Effectful `make`, acquire direct environment dependencies before defining operations, then construct the service value after those operations. Review only their reading order here. Whether the service must use `Layer.succeed`, `Layer.effect`, or `Layer.scoped` depends on lifecycle semantics and is not a layout preference.

### Use-case

Prefer:

```text
imports
→ public typed errors and result contracts
→ private selection, validation, and transformation policies
→ exported orchestration function
```

Keep the orchestration function after the policies it composes when that makes the main flow the section's final consumer.

### Renderer

Place a branch-specific private alias immediately before its render helper. Lift an alias to the renderer section's start only when several render helpers consume it. Place the exported exhaustive renderer after the branch helpers it composes.

### Command

Prefer flags and option declarations, then validation and input-conversion helpers, then the exported command. Do not move domain workflow into the command handler to satisfy this template.

### Composition root

Prefer application-layer composition, then the root program, then dependency provision and runtime invocation as the final expression. Apply this order only at a valid application or test boundary; boundary correctness is outside a layout-only finding.

## Meaningful Groups and Exceptions

- Keep a Schema adjacent to its inferred static type.
- Keep parallel schemas and inferred types as a coherent group when interleaving would fragment the section.
- Allow a schema or prerequisite declaration before an error or public contract that cannot be understood or defined without it.
- Allow several short types and functions at a section's start when interleaving them would make one concept harder to scan.
- Preserve generated-code conventions and framework-mandated order.
- Preserve hoisting-sensitive initialization, side-effect order, resource lifecycle, dependency visibility, typed-error semantics, and module boundaries.
- Accept a documented local convention or an arrangement whose consumer relationships are equally clear.

Do not recommend movement solely to match a template. Every finding must identify the relationship improved by the move and must account for the declarations crossed along the way.

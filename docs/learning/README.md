# Learning documents

Learning material is grouped by knowledge domain. Folders stay one level deep
so a topic is easy to browse without creating a taxonomy maze.

| Folder | Scope | Recommended entry point |
| --- | --- | --- |
| [`effect/`](./effect/) | Effect composition, errors, services, Layer, Scope, Match, CLI, and Bun integration | [Effect 4 learning path](./effect/effect-learning-path.html) |
| [`typescript/`](./typescript/) | Generics, narrowing, declaration order, return contracts, callbacks, and inference | [TypeScript return type guide](./typescript/typescript-return-type-guide.html) |
| [`git/`](./git/) | Review scopes, safe paths, empty tree, unified diff parsing, services, and errors | [Git service overview](./git/git-service-overview.html) |
| [`architecture/`](./architecture/) | Module boundaries, Clean Architecture, source layout, report contracts, and system case studies | [Local AI code review CLI system design](./architecture/local-ai-code-review-cli-system-design.html) |
| [`cli/`](./cli/) | Local CLI workflows and build/release scripts | [Local CLI workflow](./cli/local-cli-workflow-guide.html) |
| [`javascript/`](./javascript/) | JavaScript runtime and language primitives used by the other guides | [JavaScript WeakMap](./javascript/javascript-weakmap-guide.html) |

## Classification rule

Place an article according to the concept a reader intends to learn, not the
example used inside it. For example, an Effect service demonstrated with Git
belongs in `effect/`; the current reviewstuff Git implementation belongs in
`system-design/`.

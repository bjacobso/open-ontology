# Architecture

Forma and the TypeScript DSL produce `OntologyIR`. The IR is JSON-safe and names object types, link types, actions, and queries. `materializeOntology` restores the executable Effect Schema model. `makeOntologyRuntime` converts action changes into Triplex transactions and runs named Datalog queries. `toTriplexConfig` emits Triplex configuration nodes and constraints.

```text
TypeScript DSL ──┐
                ├──> OntologyIR ──> Triplex adapter ──> selected host
Forma source ───┘
```

The package does not own an HTTP server or UI. The initial example uses Triplex's in-memory `KvTriples.layer` only. It is not durable and does not enforce a product policy. Those host responsibilities are required for the next checkpoint.

The Forma bridge uses its reader and descriptor/elaboration API. The checked-in Lisp preludes provide the ontology-specific forms needed to bootstrap that bridge. The adapter accepts `define-entity`, `define-relation`, `define-action`, `define-mutation`, and `define-datalog-query`; unsupported recognized forms are rejected. Parser and ontology validation errors expose source locations through `error.loc` where available.

Before descriptor recognition, `(import "/std/git")` and `(import "/github")` expand the checked-in domain sources in `libraries/`. `/github` imports `/std/git`. Imports use an explicit bundled registry, never filesystem or network resolution, and load each library once per elaboration. Imported declarations and caller declarations undergo the same validation; duplicate declaration names remain errors. Source locations are retained, with `error.source` identifying a bundled library when applicable. The final IR contains ordinary declarations, so materialization and the Triplex adapter need no library-aware runtime.

The Git vocabulary is independent of a provider. `GitHubRepository` is a hosting record referencing `GitRepository`, while PR base/head references point to repository-scoped `GitBranch` objects. Commit objects can be shared across repositories, with ordered parent relations for merge ancestry. `/std/git` alone can support another hosting model. [Git libraries](git-libraries.md) documents the current vocabulary and limits.

## External languages and exploration notebooks

An external language can bootstrap its own Forma descriptors, elaborate to its own language IR, then lower that IR to `OntologyIR`. [Onto](../examples/onto/README.md) demonstrates this path without adding a package language or changing the runtime adapter. It uses an isolated example-only Forma snapshot because the npm 0.3.0 release predates unified form descriptors; [provenance](../vendor/README.md) records the pinned source. Its host forwards observed entity-state preconditions through a scoped Triples service wrapper, so guard evaluation and writes reject concurrent entity changes atomically. Rules, unsupported formulas and metadata that do not lower are listed explicitly.

The [catalog manifest](../examples/catalog.json) indexes local examples and separate explorations with kind, status, source, documentation and executable evidence. [The addition convention](adding-domains.md) keeps those layers consistent. A manual static export renders README Markdown and full source with line anchors, and captures each runner's JSON output. Site checks re-execute the runners and compare all generated artifacts. This is a reading notebook, not a browser runtime or a new application framework. Existing `404-page` handling is retained.

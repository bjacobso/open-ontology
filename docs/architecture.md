# Architecture

Forma and the TypeScript DSL produce `OntologyIR`. The IR is JSON-safe and names object types, link types, actions, and queries. `materializeOntology` restores the executable Effect Schema model. `makeOntologyRuntime` converts action changes into Triplex transactions and runs named Datalog queries. `toTriplexConfig` emits Triplex configuration nodes and constraints.

```text
TypeScript DSL ──┐
                ├──> OntologyIR ──> Triplex adapter ──> selected host
Forma source ───┘
```

The package does not own an HTTP server or UI. The initial example uses Triplex's in-memory `KvTriples.layer` only. It is not durable and does not enforce a product policy. Those host responsibilities are required for the next checkpoint.

The Forma bridge uses its reader and descriptor/elaboration API. The checked-in Lisp preludes provide the ontology-specific forms needed to bootstrap that bridge. The adapter accepts `define-entity`, `define-relation`, `define-action`, `define-mutation`, and `define-datalog-query`; unsupported recognized forms are rejected. Parser and ontology validation errors expose source locations through `error.loc` where available.

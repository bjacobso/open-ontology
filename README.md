# Open Ontology

`@open-ontology/ontology` defines a portable ontology model, compiles TypeScript and Forma sources to the same JSON-safe IR, and runs actions and named Datalog queries on Triplex. This repository starts with one package and one executable field-service example.

The selected implementation was adapted from the [historical Open Ontology repository](https://github.com/bjacobso/open-ontology-legacy) at [commit `7c2ff8a`](https://github.com/bjacobso/open-ontology-legacy/commit/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323), especially its `packages/ontology` directory. The current code removes its server convenience method and does not bring over the old workspace or runtime.

## Run

Requires Node 22 or later and pnpm 10.11.0.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm example
```

`pnpm example` loads [the TypeScript model](examples/field-service/model.ts) and [the Forma model](examples/field-service/model.lisp), checks their IR for equivalence, seeds an in-memory Triplex host, invokes `assign-work-order`, and prints the `assigned-work` query result.

## Package boundary

The package exports the TypeScript DSL, portable IR, Forma elaborator, and Triplex runtime adapter. The checked-in Forma preludes are loaded at runtime and included in the package tarball. See [architecture](docs/architecture.md) for the boundary and current operational limits.

The dependency lockfile resolves `@formalang/ts@0.3.0`, `@triplex-build/triplex@0.2.0`, and this package to `effect@4.0.0-rc.112`. Forma 0.3.0's published package declares Effect 4.0.0-rc.112; the Effect 3 boundary noted in the transition plan applied to an earlier Forma package state.

## Next checkpoint

The executable example is a local, in-memory contract check. Before presenting a server as a product host, add SQLite persistence, policy authorization, versioned config release/deploy, restart and historical-query tests, attribution and idempotency verification, and a local migration or rebuild procedure. HTTP reflection and OpenAPI follow that runtime checkpoint.

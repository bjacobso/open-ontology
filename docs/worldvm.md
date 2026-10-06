# Open Ontology and WorldVM

[WorldVM](https://worldvm.com) is a TypeScript runtime and standard library for software that models the world, reasons about it, and acts on it. Open Ontology is WorldVM's world model: it answers "What exists?"

Open Ontology keeps its own identity and the `@open-ontology/*` scope. It is usable without WorldVM: today it compiles a model to `OntologyIR` and runs it on Triplex directly, and nothing in this repository depends on WorldVM. WorldVM's `@worldvm/*` packages are proposed and not published. Everything below about WorldVM is a plan, not a shipped integration.

This document maps the current code onto the proposed WorldVM kernel, proposes a package relationship, and lists the places where the code and the WorldVM framing do not line up yet.

## Where Open Ontology sits

WorldVM's kernel is meant to know almost nothing about SaaS. Its proposed primitives are Entity, Fact, Relation, Actor, Capability, Query, Program, Change, Thread, Event, Request, Signal, Timer, Resource, and Connection. Named projects are replaceable engines inside it:

```text
                WORLDVM
   ┌───────────────┼───────────────┐
   ▼               ▼               ▼
Ontology        Program         Runtime
   │               │               │
Triplex         Runfold          Effect
```

Open Ontology fills the Ontology box. Triplex is the temporal fact store underneath it ("What is/was true?"). The Program and Runtime boxes are not part of this repository.

## Mapping the current code onto kernel primitives

| Open Ontology today | Source | Closest WorldVM primitive | Fit |
| --- | --- | --- | --- |
| Object type (`define-entity`, `Ontology.ObjectType`) | `ObjectTypeIR` | Entity (type) | Direct. Objects are Triplex entity ids. |
| Property (`:ns/field`, value type, `required`, `cardinality`, `unique`) | `PropertyIR` | Fact (attribute schema) | Direct. Each stored value is one Triplex fact. `required`, cardinality, and `unique` are recorded, not enforced on write. |
| Reference field (`ref` value type) | `OntologyValueTypeIR` | Relation | A relation without its own facts, stored as one `ref` fact on the source object. |
| Link type (`define-relation`, `Ontology.LinkType`) | `LinkTypeIR` | Relation | Partial. A link is reified as its own entity, `link:<type>:<from>:<to>`, with `from`/`to` refs and its own facts. The id is derived from the endpoints, so a pair has at most one link. |
| Named Datalog query (`define-datalog-query`) | `QueryTypeIR`, `DatalogQueryIR` | Query | Direct in shape, but the dialect is Triplex Datalog, and queries are named and take no parameters. |
| Action changes (`create`, `set`, `clear`, `link`) | `ActionChangeIR` | Change | Direct. A fixed, ordered list with no conditions or computed values. It commits as one Triplex transaction. |
| Action (name, typed inputs, `inputSchema`, changes) | `ActionTypeIR` | Request type plus a Change template | Overlaps with Program. See open questions. |
| `actor` invocation option | `ActionInvocationOptions` | Actor | Recorded on every fact, not checked. |
| `commandId`, `correlationId` | `ActionInvocationOptions` | Request identity | `commandId` gives idempotency through Triplex (`CommandAlreadyCommittedError`). |
| `now` value | `NowValueIR` | none | A caller-supplied timestamp, not a Timer. |
| Committed transaction | Triplex receipt | Event (low level) | Triplex records the transaction. Open Ontology defines no domain events. |
| `toTriplexConfig` | `src/runtime.ts` | Engine binding | Emits Triplex config nodes and constraints, plus the IR as an `open-ontology.definition` node. |
| `makeOntologyRuntime` | `src/runtime.ts` | Runtime (host adapter) | A thin, caller-provided-layer adapter. Not a WorldVM runtime. |
| none | | Capability, Policy | Not implemented. The Forma prelude recognizes `define-role` and `define-permission` and rejects them. |
| none | | Program, Thread, Signal, Timer, Resource, Connection | Out of scope. The prelude recognizes `define-process` and rejects it. |

The short version: the IR's types (object types, properties, link types) are Entity, Fact, and Relation. Its queries are Query. Its action changes are Change. Actions are where Open Ontology touches Program, and that boundary is not settled.

## Authoring syntaxes

The IR is the contract. TypeScript and Forma are two authoring syntaxes that compile to the same `OntologyIR`, and the test suite asserts identical IR for the field-service example.

Forma is one optional syntax. WorldVM must never require it, and Open Ontology does not require it for modeling: a TypeScript model never touches the Forma elaborator. The agent guide on the website uses Forma because its errors carry `line:col` and a non-programmer can review the file.

The package does still install Forma. `@formalang/ts` is a regular dependency, and the root entry re-exports the Forma elaborator. Making that optional is proposal 2 below.

## Package relationship: depend directly, or re-export as `@worldvm/ontology`?

**Option A: WorldVM depends on `@open-ontology/ontology` directly.** Developers import the ontology from `@open-ontology/ontology` and everything else from `@worldvm/*`.

- One package and one set of types. No risk of two copies of the same Effect Schema classes or `_tag`ged definitions in one process.
- Honest about the naming test: someone can use Open Ontology without WorldVM, and WorldVM users see the same name.
- But WorldVM's programming surface spans two scopes, and WorldVM's API moves at Open Ontology's release cadence.

**Option B: `@worldvm/ontology` re-exports `@open-ontology/ontology`.** A thin facade with an exact-pinned dependency. It re-exports the DSL and IR, and adds only WorldVM bindings, such as adapters from `OntologyIR` to kernel Entity and Relation.

- One import namespace, matching `@worldvm/program`, `@worldvm/query`, and the rest.
- The facade can curate: leave Forma and the standalone Triplex runtime out, and add WorldVM-only sugar.
- Keeps the engine replaceable, which is the umbrella rule.
- But two package names for one set of types. If the facade and a direct dependency resolve to different versions, `instanceof` and schema identity break. The facade must never fork or wrap types, only re-export them.

**Option C: move the source into the WorldVM monorepo.** Not recommended. It weakens the standalone identity and would make this public repository a mirror.

**Recommendation:** B, staged. Depend directly (A) while `@worldvm/core` does not exist, then introduce `@worldvm/ontology` as a re-export once the kernel defines Entity and Relation and there is something WorldVM-specific to add. `OntologyIR` stays defined here and versioned by the `formatVersion` already written into the Triplex definition node.

## Proposed structural moves (not made)

None of these are done. They are listed in the order they could land.

1. **Publish `@open-ontology/ontology` to npm.** It is not published, and every option above assumes it is.
2. **Make Forma optional at install time.** Move `@formalang/ts` to an optional peer dependency, keep the elaborator only behind `@open-ontology/ontology/forma`, and drop the Forma re-exports from the root entry. This is a breaking change in a 0.x minor. `model:check` keeps working with Forma installed.
3. **Make the root entry engine-free.** The DSL, IR, and `materializeOntology` import only types from Triplex (`DatalogQuery`). The runtime adapter already has its own `./runtime` subpath. Dropping its re-export from the root would let WorldVM depend on the model without the standalone runtime.
4. **Define kernel adapters in WorldVM, not here.** Once `@worldvm/core` defines Entity, Relation, Query, and Change, write `OntologyIR` → kernel adapters in `@worldvm/ontology`. Open Ontology should not import WorldVM.
5. **Introduce `@worldvm/ontology`** as an exact-pinned re-export, per option B.
6. **Keep the standalone host minimal.** Keep `makeOntologyRuntime` on Triplex as the reference host that proves Open Ontology works alone. Product-host work in the README's next checkpoint may belong to WorldVM instead. See open questions.

## Open questions

1. **Actions vs. Program.** An Open Ontology action is a named, typed, closed list of changes with no control flow. Is it a WorldVM Change template that Programs invoke as atomic verbs? Or should actions move into `@worldvm/program`, leaving Open Ontology with types and queries only? The closed vocabulary is what makes models checkable, which argues for keeping actions here as Changes.
2. **Is Open Ontology only "What exists?"** The IR also carries queries ("What do I know?") and action changes ("What would change?"). Either the canon treats the ontology as the schema for all three, or queries and changes move to `@worldvm/query` and a change package.
3. **Relation identity.** Links are reified entities with endpoint-derived ids, so a pair cannot have two links and there is no unlink. Should the kernel Relation be a first-class edge with its own identity, and should Open Ontology adopt it?
4. **Query dialect.** `DatalogQueryIR` is Triplex's Datalog. Is WorldVM Query the same dialect or an abstraction over it? If it is an abstraction, Open Ontology's queries need a translation layer.
5. **Prelude forms that belong elsewhere.** The checked-in Forma prelude recognizes `define-role`, `define-group`, `define-membership`, and `define-permission`, which map to Policy, Capability, and the organizations stdlib. It also recognizes `define-process`, which maps to Program and Thread. Under WorldVM these should not be implemented in Open Ontology. Should they stay rejected, or leave the prelude?
6. **Where the next checkpoint lands.** SQLite persistence, policy authorization, versioned config release, HTTP reflection, and OpenAPI are host responsibilities. Do they stay on Open Ontology's roadmap, or become WorldVM runtime and stdlib work, with Triplex owning persistence?
7. **Agent guide syntax.** With Forma demoted, should the agent guide keep leading with Forma (compact, located errors, reviewable), or switch to TypeScript?

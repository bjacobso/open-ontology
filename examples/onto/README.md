# An OntoLang-style language, running on Triplex

[OntoLang](https://onto.space/ontolang) describes actors, typed business records,
formulas, rules and stories. This independent example loads an OntoLang-shaped
language as a Forma prelude, lowers its language IR to Open Ontology's portable
`OntologyIR`, and runs the hotel story on the local in-memory Triplex runtime.
It is experimental, with no Onto runtime integration, persistence or authorization.

## Read and run

1. Read the language: [onto.lisp](onto.lisp).
2. Read the business model: [hotel.forma](hotel.forma).
3. Run the operations: `pnpm example:onto` from the repository root.
4. Compare the complete [checked output](output.json) and [lowered IR](../../test/fixtures/onto-hotel.ir.json).

Use Node 24 and pnpm 10.11.0; install with `pnpm install --frozen-lockfile`.
The example's checker is `elaborateHotel()` in [lower.ts](lower.ts), exercised by
`pnpm exec vitest run test/onto-example.test.ts`. The generic `model:check`
command accepts the package's ontology DSL, not this external language.

The website's example notebook presents this README, full source with line
anchors, model, run command and tested output together. It is a static reading
notebook; execute the command in a clone. The browser does not host Triplex.

## Three layers

| Layer | Source | Responsibility |
| --- | --- | --- |
| Language | `onto.lisp` | Syntax, types, scopes, expression inference, diagnostics, language IR |
| Business model | `hotel.forma` | Actors, hotel objects, rules, formulas, stories, seed data |
| Operations | `lower.ts`, `guards.ts`, `scenario.ts` | Portable IR, seed transactions, observed facts, guarded commands, queries and journal |

The path is `bootstrapFromSources` → `elaborateSources` → `lowerOnto` →
`toTriplexConfig` / `makeOntologyRuntime` → `triples.transact`. The prelude stays
in this example; it is not a bundled package language. `lowerOnto` is pure;
seed operations and host guard metadata are separate from the JSON-safe IR.

## OntoLang to Forma

| OntoLang | Forma (`onto.lisp`) |
| --- | --- |
| `actor Guest @type person` | `(actor Guest :person "doc" {fields})` (+ `:joins :sign-up`/`:invite`/`:none`) |
| `object Reservation`, `status: a \| b @final` | `(object Reservation "doc" :final {:status [...]} {fields})`, `:status (Union :a :b)` |
| `guest: Guest`, `services: Service[]` | `(One Guest)`, `(Many Service)` |
| `string`/`int`/`timestamp` | `String`/`Int`/`Instant` |
| `@rule …` | `(rule name Object "doc" expr)` |
| `total: int = …` | `(formula Object field Type "doc" expr)` |
| story sentence + `requires`/`sets` | `(step Actor verb Object :to Actor :requires [...] :sets {...})` inside `(story …)` |
| `seed RoomClass` | `(seed RoomClass [{...}])` |

## What executes

All 17 declarations elaborate without diagnostics. Actors and objects become
nine object types. Links become `ref` properties, `Many` preserves cardinality,
and unions become string properties. Attribute keys are explicit, for example
`:room-class/rate` and `:reservation/check-in`. The five story steps become
five actions. The runtime requires kebab-case action names, so the check-in
name is `hotel-booking-checks-in`. Updating a status clears then sets it.
`:new true` produces `create-object`; the host also rejects an existing id.

The run seeds three room classes, supplies a guest, room and invoice fixture,
then submits, confirms, rejects an early check-in, accepts check-in at exactly
15:00 UTC on November 4, 2026, requests a service and fulfils it. Reusing the
request sentence on that fulfilled service is rejected because it is final.
Reservation `declined` and `checked-out` are also terminal (tested).

`Reservation.service-charges` becomes a named Datalog sum query over explicitly
linked, fulfilled services. It returns 75 after fulfilment. Like a grouped SQL
sum, the sparse query returns no row when no fulfilled service matches; a
missing reservation group represents zero. It does not store a derived field.
The date-order rule also becomes the named `check-out-after-check-in` query,
which returns reservations satisfying the comparison; it does not reject writes.
The run prints both named queries, room classes, story outcomes, and journal
actor and command ids. Rejected commands have no journal entry.

Creation inputs supply all single-valued fields that the sentence does not
set, including reference ids. Collection membership is explicit facts. The
fixture separately asserts `Reservation.services`: the language does not
specify automatic inverse maintenance from `Service.reservation`.

## Guards and atomicity

[guards.ts](guards.ts) interprets `requires` against entity views read from
Triplex: `is?`, `known?`, `in?`, `before?`, `after?`, `days-between`, `sum`,
`now`, Boolean operators, arithmetic, and the `map`/`filter` lambdas used by
the service formula. `known?` on a link requires the target to have live facts.
Dates are UTC epoch milliseconds; `days-between` counts complete 24-hour days.
The scenario passes fixed command times. The journal's commit clock belongs
to the Triplex host, and is separate from that business clock.

**The example's guard and write are atomic with respect to observed entity
facts.** Triplex 0.2.0 exposes `TransactionMeta.preconditions` with `EntityState`
(the complete observed live triple-id set) and `TripleLive` (compare and
retract). `makeOntologyRuntime.invoke` does not forward preconditions. The
example decorates the scoped `Triples` service so its actual `transact` adds
`EntityState` preconditions for every entity read, including linked records
and the absence of a creation target. Triplex compares these inside its write
transaction; conflicts reject the whole write. No `src/` changes are needed.
Tests inject a competing write after evaluation to prove all three cases.

This is a bounded interpreter over three levels of links and ordinary,
non-scheduled facts, not a general query guard system. Time is a command input;
wall-clock passage is not a protected database fact. Direct runtime invocations
or raw transactions bypass these example guards. There is no backend enum,
transition or invariant enforcement. Follow-up work belongs in Triplex:
command configuration nodes with guards and transition constraints, applied to
all command entry points. `ActionTypeIR` would also need a portable guard contract.

## Not lowered

`notLowered()` reports these limitations and the run prints them:

- Rule `check-out-after-check-in`: a named satisfaction query runs, but there is no invariant enforcement.
- Rule `past-bookings-are-settled`: its Boolean expression is checked; no clock-driven invariant enforcement.
- Formula `Invoice.total`: checked, but its date arithmetic and derived-field composition have no faithful lowering here. The interpreter's vocabulary is tested; the run does not compute invoice totals.
- `requires` and final states: example host guards, absent from `ActionTypeIR`.
- Actor type, joins and counterpart: descriptive data; no identity or authorization enforcement.
- Union members: prelude checks, stored as strings without runtime enum constraints.
- Many references: schema retained, collection membership transacted explicitly.

Only the exact service-charge and date-order expressions are recognized for query
lowering. Changing either causes it to be reported rather than silently reusing
the old query.
Other unsupported field types throw an error. The rule query is an observation; the business rules do not become write-time
Datalog constraints or scheduled background jobs.

## Diagnostics

The test creates each broken variant with a string replacement and asserts the
code, severity and message. Expression inference follows linked record views,
including `invoice.reservation.room-class.rate`.

| Broken variant in `hotel.forma` | Diagnostic |
| --- | --- |
| `reservation.check-in` → `reservation.checkin` in a rule | `elaborate/hole-type`: missing record field |
| `invoice.reservation.room-class.rate` → `.name` | `elaborate/hole-type`: type mismatch |
| `:sets {:status :checked-in}` → `:checked_in` | `onto/unknown-state` |
| `(is? reservation.status :confirmed)` → `:confirmd` | `onto/unknown-state`, lists valid states |
| Remove `:new true` from Guest submits Reservation | Warning `onto/unguarded-transition` |
| `:room (One Room)` → `(One Suite)` | `onto/unknown-link` and `elaborate/hole-type`: unknown type Suite |
| `(formula Invoice total Int` → `String` | `elaborate/hole-type`: expected String, found Int |
| `(step Concierge fulfils Service` → `Booking` | `elaborate/hole-type`: unknown reference Booking |
| Seed `:rate 200` → `:price 200` | `onto/unknown-field` |

Removing `:new true` exposes a real ambiguity: a submission sentence with no
current-state guard could otherwise revive a declined reservation.

The supplied monomorphic `is?` workaround stays in the prelude. Forma's
keyword inference and missing-hole destructuring issues were addressed upstream
in [Forma PR 110](https://github.com/bjacobso/forma/pull/110); this example does
not implement either compiler fix.

## Forma package provenance

The npm 0.3.0 tarball predates the descriptor API used here. This example uses
an isolated, MIT-licensed snapshot of latest Forma `main` (resolved to commit
`535cd41ec7f81f3229b810df6f374ebfa04c16c7`) as the development package
`@open-ontology/onto-forma`; the package's existing `@formalang/ts` dependency
stays unchanged. See [the provenance and rebuild instructions](../../vendor/README.md).
Both APIs are consumed through package exports; no sibling project source is imported.

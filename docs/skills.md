# Exploring skills

Status: experimental design and repository-only spike. Recommend **checked agent-skill metadata alongside an ontology**, with domain qualifications remaining ordinary data. Do not add a fifth stable declaration yet. A domain qualification macro is a useful, separate follow-up; an executable workflow engine is outside this proposal.

The exploration starts from README.md, docs/architecture.md, src/ir.ts, src/runtime.ts, scripts/check-model.ts, both field-service sources, the support-desk example, and apps/site/public/llms-full.txt. The current language has four declarations and four changes. Actions each become one Triplex transaction; named queries are fixed Datalog programs without inputs. Neither action preconditions nor policy are enforced by the local runtime.

## Two problems sharing a word

An **agent skill** describes how to use a model. It has a purpose, a selected set of tools, an ordered procedure, preconditions, guards, and examples. Today the model knows the action/query contracts, but a SKILL.md author must copy them into another file. A renamed query or a changed required input can leave that document stale. The missing capability is checked reflection and packaging, not another way to mutate domain facts.

A **domain skill** is a fact about an entity: Ada has HVAC certification, level 3, expiring at a specified instant. Work requires HVAC at level 2. The missing convenience is a reusable qualification/matching pattern. The current declarations already express its data and queries; a new intrinsic would have to justify special behavior for level ordering, expiry, revocation, evidence, and renewal.

These are independent axes. An agent can run a dispatch procedure without holding an HVAC certification. A certified technician need not be an agent or have access to dispatch actions. Sharing the term does not justify sharing execution or authorization semantics.

## Before: agent skill with today's language

The unchanged core model is [field-service/model.lisp](../examples/field-service/model.lisp), with two ordinary queries added in [skills/model.ts](../examples/skills/model.ts) and [skills/model.lisp](../examples/skills/model.lisp):

```lisp
(define-datalog-query unassigned-work
  (:query {:find ["?workOrder" "?title"]
           :where [["?workOrder" ":work-order/title" "?title"]
                   ["?workOrder" ":work-order/status" "open"]]}))

(define-datalog-query technicians
  (:query {:find ["?technician" "?name"]
           :where [["?technician" ":technician/name" "?name"]]}))
```

The action is still today's action:

```lisp
(define-action assign-work-order
  (:input [workOrder String {:required true}])
  (:input [technician String {:required true}])
  (:returns String)
  (:do (changes
    (clear workOrder :work-order/status)
    (set workOrder :work-order/status "assigned")
    (link assigned-to workOrder technician {:assigned-to/assigned-at now}))))
```

Alongside this model, the author maintains [before/SKILL.md](../examples/skills/before/SKILL.md). It says when to dispatch, asks the agent to confirm an open work order and a qualified technician, lists a five-step procedure, includes an example, and copies four tool contracts. For example, it separately spells out `assign-work-order`'s required string inputs and `technicians`' output columns. That file is a concrete baseline, not a new syntax the stable language already understands. Its complete contents are used as a test fixture below.

There is no current primitive that checks the copied contracts against the model. The agent calls the ordinary queries and action through whatever host exposes them. Checking a name in a document does not confer permission to invoke it.

## Before: domain skill with today's language

This is the complete, executable [domain-before.lisp](../examples/skills/domain-before.lisp). HVAC is a Certification whose code is `HVAC`. A relation instance supplies the join object holding level and expiry:

```lisp
(define-entity Technician
  (:field [technician/name String {:required true}]))

(define-entity WorkOrder
  (:field [work-order/title String {:required true}])
  (:field [work-order/status String {:required true}])
  (:field [work-order/trade String {:required true}])
  (:field [work-order/min-level Int {:required true}])
  (:field [work-order/match-at Instant {:required true}]))

(define-entity Certification
  (:field [certification/code String {:required true}]))

(define-relation qualified-in Technician Certification
  (:field [qualified-in/level Int {:required true}])
  (:field [qualified-in/expires-at Instant {:required true}]))

(define-datalog-query eligible-technicians
  (:query
    {:find ["?workOrder" "?technician" "?name" "?level"]
     :where [["?workOrder" ":work-order/trade" "?trade"]
             ["?workOrder" ":work-order/min-level" "?minimum"]
             ["?workOrder" ":work-order/match-at" "?at"]
             ["?certification" ":certification/code" "?trade"]
             ["?grant" ":qualified-in/from" "?technician"]
             ["?grant" ":qualified-in/to" "?certification"]
             ["?grant" ":qualified-in/level" "?level"]
             ["?grant" ":qualified-in/expires-at" "?expiry"]
             ["?technician" ":technician/name" "?name"]
             [">=" "?level" "?minimum"]
             [">" "?expiry" "?at"]]}))
```

The same before model in TypeScript uses the existing surface (the query body is exactly the eleven clauses above):

```ts
const Technician = Ontology.ObjectType("Technician", {
  properties: { name: Property.make(":technician/name", Schema.String).required() },
});
const WorkOrder = Ontology.ObjectType("WorkOrder", {
  properties: {
    title: Property.make(":work-order/title", Schema.String).required(),
    status: Property.make(":work-order/status", Schema.String).required(),
    trade: Property.make(":work-order/trade", Schema.String).required(),
    minLevel: Property.make(":work-order/min-level", Schema.Number).required(),
    matchAt: Property.instant(":work-order/match-at").required(),
  },
});
const Certification = Ontology.ObjectType("Certification", {
  properties: { code: Property.make(":certification/code", Schema.String).required() },
});
const QualifiedIn = Ontology.LinkType("qualified-in", {
  from: Technician, to: Certification,
  properties: {
    level: Property.make(":qualified-in/level", Schema.Number).required(),
    expiresAt: Property.instant(":qualified-in/expires-at").required(),
  },
});
const Eligible = Ontology.QueryType("eligible-technicians", {
  query: {
    find: ["?workOrder", "?technician", "?name", "?level"],
    where: [
      ["?workOrder", ":work-order/trade", "?trade"],
      ["?workOrder", ":work-order/min-level", "?minimum"],
      ["?workOrder", ":work-order/match-at", "?at"],
      ["?certification", ":certification/code", "?trade"],
      ["?grant", ":qualified-in/from", "?technician"],
      ["?grant", ":qualified-in/to", "?certification"],
      ["?grant", ":qualified-in/level", "?level"],
      ["?grant", ":qualified-in/expires-at", "?expiry"],
      ["?technician", ":technician/name", "?name"],
      [">=", "?level", "?minimum"], [">", "?expiry", "?at"],
    ],
  },
});
const model = defineOntology({ name: "qualifications", version: "1" }, [
  Technician, WorkOrder, Certification, QualifiedIn, Eligible,
]);
```

Compared with the existing Technician/WorkOrder declarations, the Forma model adds **three declarations, six authored fields, nine triple patterns, and two comparisons**. The relation implicitly supplies two endpoint fields and one join object per technician/certification pair. An explicit Qualification entity instead needs two reference fields plus level and expiry; that alternative permits distinct grant ids and actions that replace scalar fields using clear/set.

Expiry is `expiry > match-at`, so equality means expired. `match-at` is a recorded work-order fact: Datalog cannot evaluate action `now`, and this runtime has no parameterized query. Clock freshness is the caller's responsibility. Repeating a relation link reuses its id and accumulates field values; independent old level/expiry values can cross-match. This before example assumes each pair is written once. A production renewal design needs explicit grant entities or a replacement convention; a macro must not hide this limitation.

## Candidate A: an agent-skill metadata primitive (recommended spike)

Add a finite descriptor beside the domain model, referencing its existing actions and queries. Derive the tool bundle from steps rather than maintaining a second allow-list. Use required caller inputs and explicit action bindings; query results do not automatically introduce variables. All decisions about selecting a row remain written instructions.

The same dispatch behavior in Forma is the implemented [dispatch.lisp](../examples/skills/dispatch.lisp):

```lisp
(define-skill dispatch-work
  (:purpose "Use when a dispatcher wants to assign an open work order to a technician.")
  (:inputs [workOrder technician])
  (:precondition "Confirm the selected work order is open and the technician is qualified; ask if uncertain.")
  (:query unassigned-work "Review open work and confirm the caller's workOrder id.")
  (:guard technicians nonempty "Check that the technician list is not empty.")
  (:query technicians "Confirm the caller's technician id appears in the returned rows.")
  (:action assign-work-order {:workOrder workOrder :technician technician}
    "Assign the confirmed work order.")
  (:query assigned-work "Report the assignment to the dispatcher.")
  (:example {:workOrder "work-order:42" :technician "technician:ada"}
    "Assign work-order:42 to technician:ada after confirming both ids."))
```

The implemented TypeScript [dispatch.ts](../examples/skills/dispatch.ts), attached with `defineSkillModel(ontology, [Dispatch])`:

```ts
const Dispatch = Skill.define("dispatch-work", {
  purpose: "Use when a dispatcher wants to assign an open work order to a technician.",
  inputs: ["workOrder", "technician"],
  preconditions: ["Confirm the selected work order is open and the technician is qualified; ask if uncertain."],
  steps: [
    Skill.query("unassigned-work", "Review open work and confirm the caller's workOrder id."),
    Skill.guard("technicians", "nonempty", "Check that the technician list is not empty."),
    Skill.query("technicians", "Confirm the caller's technician id appears in the returned rows."),
    Skill.action("assign-work-order", {
      workOrder: Skill.input("workOrder"), technician: Skill.input("technician"),
    }, "Assign the confirmed work order."),
    Skill.query("assigned-work", "Report the assignment to the dispatcher."),
  ],
  examples: [{
    input: { workOrder: "work-order:42", technician: "technician:ada" },
    description: "Assign work-order:42 to technician:ada after confirming both ids.",
  }],
});
```

`Skill.action`, `Skill.query`, and `Skill.guard` also accept existing definition objects. Their names survive serialization; the checker resolves them in the attached model. Skill inputs are names, with actual call contracts supplied by actions. The TypeScript helpers do not statically prove binding types across actions.

Domain skills under A retain the before model. A dispatch skill can reference `eligible-technicians` as another query without moving a technician's qualification into agent metadata. This deliberately offers no domain-data concision gain in the spike.

### IR and validation

A stable fifth declaration would require `SkillIR` in `OntologyDeclarationIR`, a `skillTypes` collection in OntologyIR/Definition, TypeScript registration, Forma descriptors/preludes, and lossless materialization. Existing runtimes and round-trip consumers would need an explicit compatibility policy. Simply adding an optional array would let old consumers silently lose the skill.

The spike instead defines [skills-ir.ts](../src/experimental/skills-ir.ts), without changing src/ir.ts:

```ts
interface SkillModelIR {
  readonly kind: "experimental-skill-model";
  readonly formatVersion: 1;
  readonly ontology: OntologyIR;
  readonly skills: readonly SkillIR[];
}
```

SkillIR contains name, purpose, required input names, prose preconditions, ordered steps, and example input/description pairs. The closed step union is query, action, guard, stop. An action value is a scalar literal or `{kind: "input", name}`. A guard refers to a fixed query and expects empty/nonempty results; it does not accept query arguments or a predicate program. Stop is unconditional.

The checker first materializes and lints the ordinary ontology, then checks:

| Condition | Result |
| --- | --- |
| Unknown action/query, including a guard query | Error |
| Duplicate skill/input, bad name, blank purpose/instruction, empty procedure | Error |
| Binding references a name absent from skill inputs | Unbound-input error; a typo never becomes a literal |
| Missing required action input or unknown argument key | Error using the model's action input fields |
| Unused declared skill input | Error |
| Step follows unconditional stop | Unreachable-step error |
| Guard might fail | Later steps remain reachable on the passing path |
| Fully literal call fails the restored action input schema | Error |
| Example lacks inputs, has extra keys, or fails any referenced action schema | Error |
| Invalid slot/arity, duplicate map key, unsupported guard expectation | Located Forma error |

Skill semantic errors locate the declaration; parse errors locate the offending syntax. Masking skill forms preserves the core source's offsets/line/column positions. The checker does not prove query satisfiability, row membership, state-dependent reachability, prose preconditions, or compatibility of all possible caller values. Mixed literal/input calls are schema-checked through examples and ultimately by the action runtime. The experiment restricts examples/bindings to scalar values; nested action inputs remain intact in generated contracts but need a richer binding surface in a later iteration.

### Execution and compilation

There is **no skill runtime**. The host runs the existing action/query primitives. A procedure guard is an instruction to its consuming agent, and prose preconditions are obligations to check. A concurrent change after the query can invalidate a precondition before the action. An action remains one transaction; the whole procedure is not atomic. Access to a generated tool bundle does not establish authorization.

[compileSkillArtifacts](../src/experimental/skills.ts) validates before emitting:

- A SKILL.md with purpose, caller inputs, preconditions, ordered calls, reflected contracts, examples, and execution boundaries.
- An llms.txt section with purpose/procedure and a link to the full skill contract.
- Tool descriptors using the existing portable JSON Schema for each referenced action and an empty input object plus projection columns for each query. Distinct `action__` and `query__` names avoid collisions across declaration kinds.
- The example runner also writes the portable experimental envelope as model.json.

Tool descriptors are input to a future MCP adapter, not a running MCP server or a new protocol implementation. The adapter must map tool names to runtime.invoke/runtime.query and supply a host layer. It may need to adapt unsupported JSON Schema features for a particular client; the spike preserves the model's contract instead of silently weakening it. Output projection names are known, but the spike does not invent a typed result schema or action return value.

This design remains closed and finite. Making it a stable declaration still adds a fifth concept, but no new change, expression evaluator, executable callback, loop, or scheduler. Keeping it as a library sidecar first protects the stable four-declaration language while testing whether checked generation is valuable.

## Candidate B: a domain qualification macro

Treat a domain skill as a template expanding to Certification, qualified-in, required WorkOrder fields, and eligible-technicians. The agent skill remains external documentation, or independently uses A. The following syntax is **proposed only**; it is not accepted by either compiler in the spike.

The complete Forma model below expands to exactly the domain before model, including its names, projection, exclusive expiry comparison, required fields, and relation id behavior. `qualification-pattern` fixes the generated Certification.code and qualified-in.level/expires-at names; it generates the three required work-order fields listed in `:requires`. The holder's display name is explicit, so a macro need not guess a property.

<!-- measure:domain-forma -->
```lisp
(define-entity Technician
  (:field [technician/name String {:required true}]))
(define-entity WorkOrder
  (:field [work-order/title String {:required true}])
  (:field [work-order/status String {:required true}]))
(define-domain-skill qualification-pattern
  (:catalog Certification certification/code)
  (:held-by Technician technician/name qualified-in)
  (:requires WorkOrder work-order/trade work-order/min-level work-order/match-at)
  (:match eligible-technicians))
```

The same proposed macro in TypeScript (Technician and WorkOrder start with their original name/title/status fields):

```ts
const qualifications = DomainSkill.pattern("qualification-pattern", {
  catalog: { name: "Certification", code: ":certification/code" },
  holder: Technician, holderName: Technician.properties.name,
  relation: "qualified-in",
  requires: {
    object: WorkOrder, code: ":work-order/trade",
    minimum: ":work-order/min-level", at: ":work-order/match-at",
  },
  match: "eligible-technicians",
});
const model = defineOntology({ name: "qualifications", version: "1" },
  DomainSkill.expand([Technician, WorkOrder], [qualifications]));
```

An implementation must explicitly rebuild WorkOrder with the generated properties and expose those rebuilt definitions to later TypeScript authoring. Hidden mutation of a definition would make it hard to review or use typed properties correctly. Expansion must reject generated name/key collisions and map errors to macro locations. If it accepts existing properties, it must check compatible owners, types, and cardinalities.

**IR:** no new runtime IR; lower to the existing four declarations. Optionally keep an authoring-only source map. **Checker:** run ordinary checks on expanded IR and validate macro options, endpoint owners, generated names, numeric levels, datetime expiry/time fields, and binding/projection names. No new action/query references or procedure steps exist in B, so unbound inputs/unreachable steps are ordinary action/query concerns. **Runtime:** exactly today's Triplex semantics. **Artifacts:** ordinary ontology JSON/config, reflected schemas, and generated matching query; no intrinsic agent procedure.

This is a library/macro, not a fifth runtime declaration. It gives the strongest domain concision but embeds opinionated policy: total numeric level ordering, one catalog code per grant, exclusive expiry, one requirement per order, and no revocation. Alternative qualification policies should be separate named templates rather than optional flags on a universal skill intrinsic. Its measured reduction below is a design estimate with a specified lowering, not implemented functionality.

## Candidate C: one capability descriptor with two facets

Use a single named skill descriptor with optional qualification and agent facets. The domain facet expands as in B; the agent facet is checked/emitted as in A. A unified HVAC capability could look like this **proposed** Forma:

```lisp
(define-skill hvac
  (:qualification
    {:catalog Certification :code certification/code
     :holder Technician :holderName technician/name :relation qualified-in
     :requires WorkOrder :trade work-order/trade
     :minimum work-order/min-level :at work-order/match-at
     :match eligible-technicians})
  (:agent
    {:purpose "Use when dispatching HVAC work."
     :inputs [workOrder technician]
     :preconditions ["Confirm a matching, current qualification before assigning."]
     :steps [[:query eligible-technicians "Confirm both ids in an eligible row."]
             [:action assign-work-order {:workOrder workOrder :technician technician} "Assign."]
             [:query assigned-work "Report the assignment."]]
     :examples [{:input {:workOrder "work-order:42" :technician "technician:ada"}
                 :description "Assign after checking the HVAC grant."}]}))
```

The same proposed TypeScript:

```ts
const Hvac = Capability.define("hvac", {
  qualification: {
    catalog: { name: "Certification", code: ":certification/code" },
    holder: Technician, holderName: Technician.properties.name, relation: "qualified-in",
    requires: { object: WorkOrder, code: ":work-order/trade",
      minimum: ":work-order/min-level", at: ":work-order/match-at" },
    match: "eligible-technicians",
  },
  agent: {
    purpose: "Use when dispatching HVAC work.", inputs: ["workOrder", "technician"],
    preconditions: ["Confirm a matching, current qualification before assigning."],
    steps: [
      Skill.query("eligible-technicians", "Confirm both ids in an eligible row."),
      Skill.action("assign-work-order", { workOrder: Skill.input("workOrder"),
        technician: Skill.input("technician") }, "Assign."),
      Skill.query("assigned-work", "Report the assignment."),
    ],
    examples: [{ input: { workOrder: "work-order:42", technician: "technician:ada" },
      description: "Assign after checking the HVAC grant." }],
  },
});
```

**IR:** a capability envelope with optional qualification-template and agent-descriptor facets; expanded domain IR remains ordinary. A stable unified primitive could instead add a capability collection, with the same compatibility burden as A. **Checker:** expand domain facets first, reject generated collisions, then resolve agent references and apply A's binding/reachability rules. **Runtime/artifacts:** B's ordinary qualification facts and Datalog plus A's agent artifacts; no inherent agent authorization or procedure execution.

This remains syntactically closed if the two facets have finite schemas, but is larger than either design alone and harder to explain. It conflates a grant template with a procedure package and creates pressure to infer permissions from qualifications. In the HVAC example, the agent could dispatch many trades; naming its entire procedure HVAC is misleading. Prefer composable descriptors and explicit query references to this unification.

## Concision measurements

| Same authored behavior | Before lines / tokens | After lines / tokens | Reduction (lines / tokens) |
| --- | --- | --- | --- |
| Dispatch skill → implemented Forma descriptor | 126 / 725 | 12 / 182 | 90.5% / 74.9% |
| Dispatch skill → implemented TypeScript descriptor | 126 / 725 | 20 / 243 | 84.1% / 66.5% |
| Qualification matching → proposed Forma macro B | 31 / 331 | 10 / 99 | 67.7% / 70.1% |

Counts include physical lines (including blank lines), comments/imports where present, and final newlines. Tokens use `tiktoken==0.12.0`, `cl100k_base`, a specified tokenizer for comparison rather than a claim about every model. The core model is identical on both sides of the agent comparison and excluded from both counts. The attachment in model.ts is one additional line; it is not counted as skill content. Generated artifacts do not become shorter: author-maintained source becomes shorter because reflection eliminates duplicated contracts.

The baseline SKILL.md contains machine-readable schemas, not just compact prose. A terse handwritten skill could be much shorter, but would omit or compress those contracts. The equivalence test proves the implemented descriptor emits this exact baseline, including guard/precondition wording and examples. This baseline fixture was frozen from the spike's artifact format; it is an illustrative before document, not a historical file used by this repository. Both surfaces keep the same procedure and reflected signatures. B's domain comparison includes the complete before/after model, with the same original entity fields; it has no claimed measured runtime equivalence because B is not implemented.

Reproduce without adding package dependencies:

```sh
python3 -m pip install --target .context/tokenizer tiktoken==0.12.0
PYTHONPATH=.context/tokenizer python3 scripts/measure-skills.py
```

## Spike boundary and how to run it

Only `src/experimental/skills*.ts` owns the new types, surface, parser extension, checks, and generator. There is no stable package export or build entry for skills. The Forma extension uses the existing reader, removes only define-skill forms with location-preserving masking, and delegates the rest to the stable elaborator. A future stable surface should use Forma's descriptor/prelude system; this parser is a small opt-in experiment.

The existing checker has one necessary opt-in path, `--experimental-skills`. Without it, Forma still rejects define-skill and TypeScript checking retains its original defineOntology behavior. With it, a TypeScript module must export the experimental envelope, preventing an accidental fallback that checks only its domain portion. JSON checker output contains the core `ir` and a separate `skills` field. The saved model.json is the versioned envelope for portable artifact generation.

```sh
pnpm model:check examples/skills/model.lisp --experimental-skills --name skills-field-service --version 1
pnpm model:check examples/skills/model.ts --experimental-skills
pnpm model:check examples/skills/domain-before.lisp
pnpm exec tsx examples/skills/run.ts .context/skills
```

Tests cover equal Forma/TypeScript IR, JSON round trips, exact before/after artifact equality, preservation of refined action contracts, tool-name collisions across kinds, invalid references/bindings/examples, unreachable steps, opt-in checking, and located parser/core errors. Core runtime tests still exercise the unchanged transaction/query behavior. No SKILL.md is installed into this coding agent; the generated artifacts are outputs of the ontology experiment.

## Recommendation and open questions

Proceed with A as a library sidecar experiment. It addresses model/document drift with a small finite schema and no runtime expansion. Domain skills stay ordinary domain data; consider B when several real models reveal the same qualification pattern. Keep the two composable. Do not ship C or an executable procedure engine under the same word.

The trade-off is that “first-class” initially means modeled, checked, portable authoring metadata, not a fifth stable runtime declaration. A becomes worth promotion only if real consumers depend on cross-model portability and lossless skill round trips enough to justify extending every model consumer. A new core declaration can stay closed and small, but the current spike does not need one.

Open questions for a later design review:

- Should skills be included in a versioned ontology envelope or released as separately versioned packages tied to a model snapshot?
- Should the host expose only step-referenced tools, or should a skill be able to list optional tools without a procedure step?
- Are non-executable procedure guards clear enough, or should they be called checks? Actual transaction guards need their own design and enforcement tests.
- Should inputs infer a shared schema across action calls? How should nested values, query row selection, and evidence be represented without creating a workflow language?
- Which artifact schema features do target MCP clients accept, and should result schemas be inferred or declared?
- For domain qualifications, do we need grant identity/history, revocation, multiple requirements, nonnumeric levels, or always-current clock evaluation before choosing a macro?
- What compatibility policy would prevent older consumers from silently discarding a stable skill declaration?

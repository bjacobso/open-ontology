# Onboarded domain study

This is a selected, illustrative study informed directionally by supplied Onboarded schema and API context. The complete attachments stay in the workspace's private `.context` directory; the example contains hand-authored declarations and synthetic facts. The unlisted `/onboarded` site page presents both parts.

## Northwind account program

[`northwind.account.lisp`](northwind.account.lisp) configures one synthetic account end to end in nine verbs:

| Verb | Declares |
| --- | --- |
| `account` | Name (the key namespace), languages, sender and support emails, deduplication criteria |
| `attributes` | Typed custom attributes on built-in entities, with closed choices and `:searchable`, `:sensitive`, `:scope`, `:pattern`, and `:deprecated` |
| `rule`, `def` | Named three-valued predicates reused everywhere; build-time arithmetic |
| `form` | Pages and fields that bind attributes or form answers; `:from` references another package's form |
| `policy` | `:when` a placement matches, `:require` forms, optionally each with its own `:when` |
| `automation`, `param` | A trigger, then `wait`, `when`, `email`, and `assign` steps; per-target parameters |
| `group` | Permissions plus an access rule |
| `integration` | A pinned provider revision and a connection reference |
| `scenario` | Facts, then `expect`, `record`, and `complete` on day 0 and later `(day n ...)` |

The Forma reader parses the file. The TypeScript elaborator in [`account/`](account) is example code, not a Forma prelude or package export:

- [`elaborate.ts`](account/elaborate.ts) resolves names and attribute paths; checks types and choice literals, field/attribute compatibility, deprecated writes, sensitive-attribute flags, policy and trigger fact scopes, `:scope`-only access rules, key namespaces, and due dates required by waits. Every problem is reported with a line and column, without cascading errors.
- [`lower.ts`](account/lower.ts) lowers declarations to directional `account`, `property`, `form-reference`, `form`, `parameter`, `policy`, `automation`, `user-group`, `integration`, and `scenario` resources. Names map to platform snake_case, named rules are inlined where used, and `def` arithmetic folds into constants. The shapes echo platform field names but are not production formats.
- [`evaluate.ts`](account/evaluate.ts) evaluates policies with three-valued logic: an unrecorded fact is unknown, and an unknown outcome names the facts it is waiting for. Scenarios play a placement forward day by day: policies assign tasks, task due dates come from `:due-in`, automations wait, decide, email (rendering simple `{{ entity.field }}` variables), and assign.
- [`check.ts`](account/check.ts) fails on elaboration errors, failing scenario expectations, and any policy or automation decision that no scenario sees both true and false.
- [`mistakes.ts`](account/mistakes.ts) lists ten plausible edits; tests require each to produce exactly one located error.

```sh
pnpm account:check examples/onboarded/northwind.account.lisp
pnpm account:check examples/onboarded/northwind.account.lisp --json
```

Nothing here calls Onboarded, plans against or deploys to an account, renders forms, evaluates runtime formulas, runs integrations, or enforces access rules.

## Domain ontology

The [TypeScript model](model.ts) exports twenty object types, two demo actions, and three Datalog queries, explored in four graph views:

| View | Concepts and relationships |
| --- | --- |
| People & work | Accounts, employees, employers, placements, and tasks; a task references a concrete template and can have a user as employer assignee. |
| Forms & versions | A form lineage has versions; a concrete task template references its version and lineage; page templates contain fields. |
| Account & access | Accounts belong to organizations; organization membership and user-group membership are distinct records. |
| Policy & scope | Policies reference form lineages through policy forms; custom properties carry permission-scope flags; automations and inference rules describe account configuration. |

Placements describe an employee's employment context, while tasks share employee/account/employer dimensions. There is no direct `Task.placement` reference in this model. Client/job-type dimensions, suggested tasks, runtime page/field submissions, files, external integrations, connected organizations, and distribution are omitted. An employee's name is reduced to one synthetic display field. Optional/shared configuration ownership is retained where useful, but this example does not reproduce the complete schema or API contracts.

```sh
pnpm model:check examples/onboarded/model.ts
pnpm example:onboarded
```

The local scenario seeds an example form lineage/version/template and creates a task. `request-review` replaces its next action and employer assignee; repeating it with another user leaves only the new assignee in the review queue. `employee-input` and `employer-review` are demo next-action values. The `requires_action` status remains unchanged. These actions exercise local Triplex mutations and queries, with no Onboarded API requests or production workflow semantics. User-group rules, policy rules, field rules, automation trigger descriptions, and authorization inference configuration are modeled as opaque data in this ontology.

## Site artifacts

`pnpm site:export-onboarded` writes two browser artifacts. `model.json` holds the ontology IR, the runtime transcript, and the graph views from `apps/site/onboarded-views.json`, where diagram positions are defined and arrows come from reference properties. `account.json` holds the Northwind source, its lowered resources per declaration, the checker output, scenario timelines, decision coverage, each mistake's recorded diagnostic, and the policy evaluator's result for every combination of the simulator's facts. Tests verify that both artifacts match the checked-in sources.

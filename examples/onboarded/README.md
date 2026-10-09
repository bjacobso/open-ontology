# Onboarded domain study

This is a selected, illustrative model informed directionally by supplied Onboarded schema and API context. The complete attachments stay in the workspace's private `.context` directory; the example contains hand-authored declarations and synthetic facts, plus selected excerpts from a supplied Northwind design sketch.

The [TypeScript model](model.ts) exports twenty object types, two demo actions, and three Datalog queries. The [site explorer](https://open-ontology.com/onboarded) presents four views:

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
pnpm site:export-onboarded
```

The local scenario seeds an example form lineage/version/template and creates a task. `request-review` replaces its next action and employer assignee; repeating it with another user leaves only the new assignee in the review queue. `employee-input` and `employer-review` are demo next-action values. The `requires_action` status remains unchanged. These actions exercise local Triplex mutations and queries, with no Onboarded API requests or production workflow semantics.

User-group rules, policy rules, field rules, automation trigger descriptions, and authorization inference configuration are modeled as data. The permission-scope study reads synthetic `CustomProperty.isPermissionScope` flags and illustrates a possible future authoring check. This package does not evaluate those rules, enforce authorization, elaborate forms, publish form versions, or execute automations. The I-9 helper is a partial predicate using the form DSL from the original discussion; it is not an I-9 eligibility implementation.

`apps/site/onboarded-views.json` defines diagram positions; arrows come from the model's reference properties. The exported browser artifact includes the model IR, scenario transcript, custom-property flags, and graph views. Tests verify export freshness, graph coverage, and the task/reassignment query results.

## Northwind account sketch

The page also explores selected excerpts from a supplied `northwind.account.forma` sheet, in [`northwind-study.json`](../../apps/site/public/onboarded/northwind-study.json). That sheet belongs to a separate account DSL context; its referenced account docs and executable TypeScript account are not in this repository. The `[built]` markers describe TypeScript features in that supplied context, `[proposed]` describes design intent, and `[unsupported]` describes an adapter limit. No `onboarded` Forma prelude exists here, and neither its syntax nor its journeys have been verified.

The study connects the package namespace and W-4 dependency, typed attributes and helpers, three local forms, two policies, two automations, group access, a proposed integration binding, and authored journeys. Its target is an account resource IR, which is distinct from this package's `OntologyIR`. Byte-identical snapshots would be an acceptance criterion for a future prelude; the reference snapshots are not included.

The placement selector displays the sheet's four authored expectations. It does not evaluate policy rules. The missing-union-local case preserves its `three_state` setting, unknown policy/form outcomes, and missing attribute. The reminder/story depends on a proposed 30-day task release setting. Code excerpts may include proposed options within a section whose overall status is `[built]`; the accompanying notes call out these dependencies.

# Platform DSLs: proposed direction

Open Ontology's homepage explores domain-specific languages for Salesforce,
Stripe, and Foldkit. These are design studies, not implemented targets or
installable packages. Their syntax is illustrative and may change.

The idea is to describe each system in its own vocabulary and make references
between those models explicit. A billing price book could define the choices
for a CRM plan field and an application's plan selector. Shared domain concepts
would require explicit mappings; matching names alone would not make records
or lifecycles interchangeable.

## Proposed targets

- **Salesforce:** describe objects, fields, and validation rules, then generate
  reviewable metadata. [CustomField metadata](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_customfield.htm)
  is an example of the intended target vocabulary.
- **Stripe:** describe products and prices, then generate API parameters.
  [Stripe's price model](https://docs.stripe.com/api/prices) provides the target
  vocabulary. Applying changes would require a separate reconciliation design.
- **Foldkit:** describe application models and messages, then generate
  TypeScript declarations for a Foldkit app.
  [Foldkit](https://foldkit.dev) is a TypeScript frontend framework built on
  Effect with explicit Models, Messages, update functions, and Commands.
  Updates, views, and command integration remain open design questions.

There is no generator, prelude, adapter, or integration for any of these targets
in this repository. It has no Foldkit dependency or workbench. The proposed
`model`, `message`, `object`, `price`, aliased package imports, and exports shown
on the homepage are not accepted by the v0.1 ontology adapter. No `oo` CLI,
platform package registry, cross-project platform checker, or deployment flow
exists here.

## What exists today

Forma and TypeScript authoring produce the same portable JSON IR. The package
checks models and runs actions and named Datalog queries on a local in-memory
Triplex host. See [architecture](architecture.md), the
[field-service model](../examples/field-service/model.lisp), and its
[equivalence and runtime tests](../test/field-service.test.ts).

The bundled `/std/git` and `/github` libraries share Git types with a GitHub
hosting model. They describe a local graph, not live GitHub configuration.
See [Git libraries](git-libraries.md) and
[library conformance tests](../test/forma-libraries.test.ts). They do not
implement the proposed general business vocabulary or platform package system.

## Questions before an implementation

Which platform and smallest useful slice comes first? Who owns shared identity
mappings? How should native output be checked against live configuration drift?
What needs human review before applying? A real spike should answer these
questions with a generator and conformance tests before claiming support.

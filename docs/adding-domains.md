# Adding a domain or exploration

Start with an entry in [the catalog](../examples/catalog.json). The
[exploration index](https://open-ontology.com/explorations/) presents the same
catalog to people; its [JSON](https://open-ontology.com/explorations/catalog.json)
is available to agents. An entry can begin as a sketch and become runnable
without changing its id or URL.

## Choose the kind and status

A **domain** describes business records and operations (support desk, GitHub,
Onboarded). A **language** adds authoring syntax or compilation (Onto). A
**platform** targets another product (Stripe, Salesforce, Foundry). A
**framework** concerns the host or generated application (Effect, Foldkit).
These are catalog classifications, not new package APIs.

| Status | Evidence required |
| --- | --- |
| `runnable` | Checked-in README, model, runner, package script and behavior test |
| `sketch` | An explicit description and link to the design; no runnable command |
| `review` | Link to the separate open PR; do not imply it is merged |
| `external` | Link to upstream docs/source; no implied local command |

For work outside this checkout, link its PR or upstream repository. Do not copy
another branch's implementation or promote a homepage sketch to a working
integration. Update entries when their linked work lands or closes.

## A runnable example

Use `examples/<id>/` with a stable kebab-case id. Keep these responsibilities
visible, even if a small example combines files:

| File or field | Contract |
| --- | --- |
| `README.md` | What it models, language/model/operations links, how to run, what is checked, what is omitted, operational limits |
| `model.lisp`, `model.forma` or `model.ts` | Business declarations, separate from scenario facts |
| `scenario.ts` | Deterministic synthetic facts, fixed business clock, commands and queries; reusable by tests |
| `run.ts` | Prints the scenario result; wire `pnpm example:<id>` in package.json |
| `test/<id>.test.ts` | Behavior coverage; a lowering golden and negative diagnostics when introducing a language |
| `onto.lisp` or another named prelude | Only when introducing a language; keep experimental external languages in the example |
| `lower.ts` | Language IR → portable `OntologyIR`; report unsupported features |
| `guards.ts` | Host-specific checks if needed; state whether checks and writes are atomic |

A shared language belongs in the catalog's `sources` with role `prelude`.
An existing vocabulary belongs there as `library`. If the example has no
prelude (such as Onboarded's handwritten account elaborator), say so. Link the
actual implementation rather than inventing a language source.

Reusable domain vocabulary can later move to `libraries/`, following
[Git's extension pattern](git-libraries.md). A new bundled import needs an
explicit entry in `src/forma-libraries.ts`; the catalog itself does not install
or load a language. Keep portable IR JSON-safe. Do not import sibling project
source; consume a pinned package dependency.

## Register and publish the reading notebook

Add an entry to `examples/catalog.json`: `id`, `title`, `kind`, `status`,
`summary`, `readme`, `command`, `test`, `sources`, and `links`. Each source has
`path` and `role`; a runnable entry needs `model` and `runner` sources. Paths
are repository-relative. Commands are direct `pnpm` package scripts with a
`tsx examples/<id>/run.ts` entrypoint. An optional `output` fixture is checked
against the command's JSON result.

Run `pnpm site:export-explorations` after editing registered files. It produces
checked-in static assets in `apps/site/public/explorations/`:

- `/explorations/`: the catalog and this convention.
- `/explorations/<id>/`: rendered README, sources, complete model, run command and actual output.
- `/explorations/source/<repo-path>.html#L12`: full source with stable line links.
- `/explorations/raw/<repo-path>`: byte-for-byte source, including raw Markdown.
- `/explorations/<id>/output.json`: the scenario's result.
- `/explorations/catalog.json`: the manifest for agents.

These are static reading notebooks. They do not execute in the browser. The
exporter runs each local example to capture the results; `pnpm site:check`
reruns them and rejects stale assets, missing paths or invalid entries. No
framework, server or SPA fallback is involved. Do not edit generated pages.

Run `pnpm check` before opening a PR against `main`. Keep agent example links
in sync. Describe exactly what runs and what is only checked, plus guard,
identity, persistence and authorization limits where relevant. Deployment uses
the existing pipeline; adding an entry does not deploy an integration.

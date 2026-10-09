# Open Ontology

`@open-ontology/ontology` defines a portable ontology model, compiles TypeScript and Forma sources to the same JSON-safe IR, and runs actions and named Datalog queries on Triplex.

Maturity: **experimental (v0.1)**. One package, four executable examples, and a local in-memory runtime; no durable server or npm release yet.

The selected implementation was adapted from the [historical Open Ontology repository](https://github.com/bjacobso/open-ontology-legacy) at [commit `7c2ff8a`](https://github.com/bjacobso/open-ontology-legacy/commit/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323), especially its `packages/ontology` directory. The current code removes its server convenience method and does not bring over the old workspace or runtime.

Join the community on [Discord](https://discord.gg/cjW4gxsdXK).

## Run

Requires Node 22 or later and pnpm 10.11.0.

```sh
git clone https://github.com/bjacobso/open-ontology.git
cd open-ontology
pnpm install --frozen-lockfile
pnpm check
pnpm example
pnpm example:support-desk
pnpm example:github
pnpm example:onboarded
pnpm model:check examples/support-desk/model.lisp
```

`pnpm example` loads [the TypeScript model](examples/field-service/model.ts) and [the Forma model](examples/field-service/model.lisp), checks their IR for equivalence, seeds an in-memory Triplex host, invokes `assign-work-order`, and prints the `assigned-work` query result. `pnpm example:support-desk` runs a Forma-only model that exercises `create`, `clear` followed by `set`, reference fields, relations, negation, ordering, and aggregates.

`pnpm model:check <model.lisp | model.ts>` elaborates a model, applies the runtime's naming and input-schema rules, and reports errors with `file:line:col`. It also warns about models that compile but misbehave: queries that match undeclared attributes or find unbound variables, optional inputs used by changes, single-valued fields set without a preceding `clear`, and changes that target a fixed object id. Pass `--json` for machine-readable output.

## Git and GitHub libraries

Forma models can write `(import "/std/git")` for shared repositories, branches, commits, ancestry, forks, and dependencies, or `(import "/github")` for that graph plus GitHub accounts, hosting records, issues, pull requests, memberships, and collaborators. Imports load bundled Lisp sources once per model. A future `/gitlab` can reuse `/std/git`; it is not bundled yet.

`pnpm example:github` runs [a local GitHub graph](examples/github/model.lisp), including a PR from a fork, a referenced issue, dependency links, and merge parents. These are synthetic facts, with no GitHub API connection. See [Git libraries](docs/git-libraries.md) for the vocabulary, id conventions, and extension pattern.

## Onboarded domain study

[`/onboarded`](https://open-ontology.com/onboarded) explores an illustrative onboarding domain: accounts, employees, cases, document metadata, reviewers, and memberships. It uses [a working TypeScript model](examples/onboarded/model.ts), with synthetic facts and a recorded local Triplex transcript from `pnpm example:onboarded`. It is not Onboarded's production configuration. The page's I-9 helper and permission-scope demonstrations are design studies; form elaboration and scope-based authorization are not implemented by this example.

After changing the model or scenario, run `pnpm site:export-onboarded` to refresh the checked-in browser artifact. Tests verify that its ontology and transcript match the executable code.

## Package boundary

The package exports the TypeScript DSL, portable IR, Forma elaborator, and Triplex runtime adapter. The checked-in Forma preludes and domain libraries are loaded at runtime and included in the package tarball. See [architecture](docs/architecture.md) for the boundary and current operational limits.

## Website

The static site in [apps/site](apps/site) adapts the visual design of the historical repository's `packages/web/app/routes/home.*`. Its primary reader is an agent modeling a domain on someone's behalf. The homepage points agents to [`llms-full.txt`](apps/site/public/llms-full.txt), a single plain-text authoring guide covering the grammar, a modeling procedure, the checker, runtime semantics, and limits, and to its [`llms.txt`](apps/site/public/llms.txt) index. `test/agent-guide.test.ts` keeps the guide honest: every Forma block must check without warnings, and the quoted checker and example output must match what the commands print. Run `pnpm site:check` to validate local links and assets, or `pnpm site:dev` to preview it with Wrangler.

The [site deployment workflow](.github/workflows/deploy-site.yml) checks pull requests and deploys merges to `main` to the personal Cloudflare account as the `open-ontology-site` Worker, which serves `open-ontology.com`. It needs `CLOUDFLARE_ACCOUNT_ID` and a scoped `CLOUDFLARE_API_TOKEN` GitHub secret. The token needs Workers Scripts Write for the account and Workers Routes Write for the `open-ontology.com` zone when attaching or changing the custom domain.

The dependency lockfile resolves `@formalang/ts@0.3.0`, `@triplex-build/triplex@0.2.0`, and this package to `effect@4.0.0-rc.112`. Forma 0.3.0's published package declares Effect 4.0.0-rc.112; the Effect 3 boundary noted in the transition plan applied to an earlier Forma package state.

## Next checkpoint

The executable example is a local, in-memory contract check. Before presenting a server as a product host, add SQLite persistence, policy authorization, versioned config release/deploy, restart and historical-query tests, attribution and idempotency verification, and a local migration or rebuild procedure. HTTP reflection and OpenAPI follow that runtime checkpoint.

MIT licensed; see [LICENSE](LICENSE). Part of the [WorldVM](https://worldvm.com) family of experiments.

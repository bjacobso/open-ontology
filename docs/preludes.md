# Preludes and bundled libraries

Open Ontology is experimental v0.1. All six Lisp sources below ship with the
package. Two are bundled domain imports, one is the default authoring language,
and three support compiler bootstrap. They are not six interchangeable imports.

The [catalog](https://open-ontology.com/preludes.html) links to individual guides,
checked model examples, and raw sources. Work inside a clone using Node 24 and
pnpm 10.11.0; there is no npm release yet.

| Source | Role | How it is used |
| --- | --- | --- |
| `libraries/std/git.lisp` | Provider-neutral Git model | `(import "/std/git")` |
| `libraries/github.lisp` | GitHub hosting and collaboration metadata | `(import "/github")`, which also imports `/std/git` |
| `preludes/ontology.lisp` | Default ontology authoring language | Loaded automatically by the Forma adapter |
| `preludes/compiler.lisp` | Form descriptors and compile-time meta vocabulary | Loaded during compiler bootstrap |
| `preludes/ontology-compiler.lisp` | Ontology bindings, validation, result types, and construction hooks | Loaded during compiler bootstrap |
| `preludes/viewspec-compiler.lisp` | Hosted ViewSpec layout-validation hook | Loaded during compiler bootstrap; view models are unsupported by this adapter |

## Modeling today

The adapter supports `define-entity`, `define-relation`, `define-action`,
`define-mutation`, and `define-datalog-query`. The Lisp source contains other
descriptors, but a recognized form outside this set is rejected by the Triplex
ontology adapter. HTTP and view descriptors are not runnable model features.

Both Forma and the TypeScript DSL produce JSON-safe `OntologyIR`. Actions and
named Datalog queries run on the local in-memory Triplex runtime. The package
does not provide persistence, an HTTP server, or product authorization. See the
[agent guide](https://open-ontology.com/llms-full.txt) for supported grammar and
[architecture](architecture.md) for the runtime boundary.

The [Git libraries guide](git-libraries.md) documents the complete vocabulary,
identity conventions, write behavior, and limits for `/std/git` and `/github`.
Imports use an explicit bundled registry, not file or network resolution. Each
library loads once per model, and all declarations share one namespace. Other
import paths, aliases, and redeclaration of imported types are unsupported.

```sh
pnpm install --frozen-lockfile
pnpm model:check examples/github/model.lisp
pnpm example:github
pnpm example:support-desk
```

## Reading compiler support

`src/forma.ts` passes the four sources in `preludes/` to Forma's
`bootstrapFromSources`. The compiler vocabulary describes form descriptors and
meta-functions; `ontology.lisp` declares the ontology forms; the elaboration
files supply named hooks. The public `ontologyPreludeSources` object exposes
these sources for inspection. `formaLibrarySources` separately exposes the two
bundled domain import sources.

To trace a declaration:

1. Find its `define-form` in `preludes/ontology.lisp`.
2. Follow its `:bindings-fn`, `:validate-fn`, `:result-type-fn`, or `:construct-fn`
   to the corresponding hook in the compiler support files.
3. Inspect `src/forma.ts` to see which forms and constructed payloads the adapter
   accepts and converts to portable ontology IR.

The landing pages label compiler excerpts as source references. `define-form`,
`meta-fn`, and calls such as `meta/*` and `construct/*` describe compiler machinery;
they are not user model declarations. A complete ViewSpec hook being present in
the source does not imply that this package renders layouts or hosts a UI.

## Platform sketches

The homepage's Salesforce, Stripe, Okta, GitHub teams, PagerDuty, cross-project
configuration, and `oo` package-manager examples are v0.2 design sketches. They
are not available library imports or commands. In particular, the shipped
`/github` vocabulary records local metadata and does not deploy teams, call the
GitHub API, synchronize platform configuration, or enforce permissions. There
is no native platform deployment, reconciler, or package registry today.

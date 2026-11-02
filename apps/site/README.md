# Website

This static site preserves the layout and palette of the historical Open Ontology homepage at [`packages/web/app/routes/home.tsx`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.tsx) and [`home.css`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.css). Its content reflects the new repository's smaller package boundary and is written first for agents modeling a domain for someone: `public/llms-full.txt` is the complete authoring guide, and `public/llms.txt` is its index.

`public/` is served directly as Cloudflare Worker static assets. No React app, old runtime, or workspace package is needed.

`public/zapier/index.html` serves the `/zapier` landing page, a design study for a proposed Zapier prelude. Its workflow, Forma syntax, platform imports, and review feedback are illustrative. The review controls switch between static examples; there is no Zapier connection, checker, or deployment adapter behind the page. The page shares the site's typography and base styles, with scoped styles and progressive enhancement in `public/zapier/`.

`public/onboarded/index.html` serves the unlisted `/onboarded` study. The page reads as a pitch followed by documentation: why, quick start, and a static guide to the nine verbs whose examples are quoted verbatim from `northwind.account.lisp` (a test checks the quotes and the hero numbers). `account.js` highlights those examples and adds the recorded material from `public/onboarded/account.json`: lowered resources per verb, diagnostics for ten example mistakes, a three-state policy simulator over precomputed results, and scenario timelines with decision coverage. `explorer.js` presents the domain ontology and runtime transcript from `public/onboarded/model.json`, with graph positions from `onboarded-views.json`. `pnpm site:export-onboarded` writes both artifacts from `examples/onboarded`, and tests check that they stay in sync. The browser evaluates nothing itself. `check.mjs` discovers HTML pages recursively and checks links to directory index routes as well as files.

```sh
pnpm site:check
pnpm site:dev
```

## Deployment

[`alchemy.run.ts`](../../alchemy.run.ts) uses `alchemy` and `@alchemy.run/cloudflare` at `2.0.0-beta.84`. There is no site build: `public/` is the deployment artifact, including the plain-text agent files. The assets-only Worker retains `404-page` handling, directory index routes (`/onboarded`, `/zapier`), and the existing compatibility date. Wrangler remains the local static-site preview tool; its config is not used by deployment.

- [CI](../../.github/workflows/ci.yml) runs `pnpm check` on PRs and pushes to `main`.
- [Production](../../.github/workflows/deploy.yml) runs `alchemy deploy --stage prod --yes` only after successful push CI on `main`, checking out the exact successful commit. Stage `prod` adopts the existing `open-ontology-site` Worker in place and binds https://open-ontology.com.
- [PR previews](../../.github/workflows/preview.yml) deploy same-repository PR heads to `pr-<number>` as `open-ontology-site-pr-<number>`, with no custom domain. One sticky comment links to the actual `workers.dev` URL read from Alchemy state. Closing or merging a PR runs `alchemy destroy` for that stage and marks the comment removed. Fork PRs never receive credentials or deploy.

Production and each PR stage have separate concurrency groups, with cancellation disabled so state updates and cleanup can finish. A queued deploy skips a PR that has since closed or moved to another commit. Missing Cloudflare secrets produce a workflow notice and skip deployment or cleanup; after restoring credentials, rerun a skipped close workflow to remove its preview.

Ben must configure these **repository Actions secrets**, available to both deployment workflows:

- `CLOUDFLARE_ACCOUNT_ID`: the existing site's Cloudflare account, with a `workers.dev` subdomain enabled.
- `CLOUDFLARE_API_TOKEN`: scoped to that account with Workers Scripts Write, Account Settings Read, and Secrets Store Write; production also needs Zone Read and Workers Routes Write for the `open-ontology.com` zone. The existing Wrangler token may need its scope expanded. Alchemy's state store uses a Durable Object with SQLite and account Secrets Store secrets, so the account must support those services. See [Alchemy CI permissions](https://alchemy.run/environments/ci/) and [Cloudflare Secrets Store permissions](https://developers.cloudflare.com/secrets-store/access-control/).

GitHub Actions must permit `GITHUB_TOKEN` to write pull-request comments (`pull-requests: write`, declared in the preview workflow); no personal GitHub token is needed. The production `workflow_run` trigger becomes active once these workflow files reach `main`. Open or synchronize a same-repository PR to verify the preview workflow, then close it to verify cleanup.

Both workflows set `CI=true`. Deployment state lives in the named `Cloudflare.state({ name: "open-ontology" })` store, whose Worker is `alchemy-state-store-open-ontology`; stage state survives GitHub runner replacement so a later close event can destroy the preview. CI resolves state-store credentials through the account Secrets Store. No local state cache, `ALCHEMY_PASSWORD`, or additional state token secret is needed. The first pipeline deploy can bootstrap the store with `--yes`; later deploys reuse or upgrade it. Avoid starting concurrent first deployments before that bootstrap completes. The beta.84 maintenance commands are `alchemy state bootstrap --backend cloudflare --name open-ontology` and `alchemy state list --backend cloudflare --name open-ontology`; the former provisions infrastructure and must not be run as a local check. See [state-store setup](https://alchemy.run/state-store/).

For local verification without deploying:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec alchemy state bootstrap --help
pnpm exec alchemy state read --help
```

`test/deploy.test.ts` plans the actual entrypoint for production and multiple previews with an in-memory state store and a provider that cannot deploy, and checks the OAuth/PKCE compatibility patch and authenticated HTTP state reads. With an existing state store and Cloudflare credentials, `pnpm exec alchemy plan --stage prod --no-input` inspects the live migration. Do not pass `--yes` for a local plan: Alchemy can otherwise provision or upgrade a state store during planning. `pnpm site:deploy` is the pipeline's production command; do not run it from a workspace.

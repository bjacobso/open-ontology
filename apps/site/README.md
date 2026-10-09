# Website

This static site preserves the layout and palette of the historical Open Ontology homepage at [`packages/web/app/routes/home.tsx`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.tsx) and [`home.css`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.css). Its content reflects the new repository's smaller package boundary and is written first for agents modeling a domain for someone: `public/llms-full.txt` is the complete authoring guide, and `public/llms.txt` is its index.

`public/` is served directly as Cloudflare Worker static assets. No React app, old runtime, or workspace package is needed.

`public/onboarded/index.html` serves the `/onboarded` domain explorer. Its JSON artifact is exported from `examples/onboarded/model.ts`, a synthetic local Triplex scenario, property flags, and `onboarded-views.json` with `pnpm site:export-onboarded`; tests check that it stays in sync and every modeled object appears in a view. Four graph views separate people/work, forms/versions, account/access, and policy/scope configuration. The page distinguishes the executable v0.1 model from illustrative I-9 form helpers and proposed permission scopes. `check.mjs` discovers HTML pages recursively and checks links to directory index routes as well as files.

```sh
pnpm site:check
pnpm site:dev
```

The `open-ontology-site` Worker serves https://open-ontology.com. After `main` checks pass, `.github/workflows/deploy-site.yml` deploys the site with Wrangler. The two GitHub Actions secrets are described in the root README. There is no site build: `public/` is the deployment artifact, including the plain-text agent files. `pnpm check` includes the site checks.

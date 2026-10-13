# Website

This static site preserves the layout and palette of the historical Open Ontology homepage at [`packages/web/app/routes/home.tsx`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.tsx) and [`home.css`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.css). Its content reflects the new repository's smaller package boundary and is written first for agents modeling a domain for someone: `public/llms-full.txt` is the complete authoring guide, and `public/llms.txt` is its index.

`public/` is served directly as Cloudflare Worker static assets. No React app, old runtime, or workspace package is needed.

`public/onboarded/index.html` serves the unlisted `/onboarded` study. The page reads as a pitch followed by documentation: why, quick start, and a static guide to the nine verbs whose examples are quoted verbatim from `northwind.account.lisp` (a test checks the quotes and the hero numbers). `account.js` highlights those examples and adds the recorded material from `public/onboarded/account.json`: lowered resources per verb, diagnostics for ten example mistakes, a three-state policy simulator over precomputed results, and scenario timelines with decision coverage. `explorer.js` presents the domain ontology and runtime transcript from `public/onboarded/model.json`, with graph positions from `onboarded-views.json`. `pnpm site:export-onboarded` writes both artifacts from `examples/onboarded`, and tests check that they stay in sync. The browser evaluates nothing itself. `check.mjs` discovers HTML pages recursively and checks links to directory index routes as well as files.

```sh
pnpm site:check
pnpm site:dev
```

The `open-ontology-site` Worker serves https://open-ontology.com. After `main` checks pass, `.github/workflows/deploy-site.yml` deploys the site with Wrangler. The two GitHub Actions secrets are described in the root README. There is no site build: `public/` is the deployment artifact, including the plain-text agent files. `pnpm check` includes the site checks.

# Website

This static site preserves the layout and palette of the historical Open Ontology homepage at [`packages/web/app/routes/home.tsx`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.tsx) and [`home.css`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.css). Its content reflects the new repository's smaller package boundary and is written first for agents modeling a domain for someone: `public/llms-full.txt` is the complete authoring guide, and `public/llms.txt` is its index.

`public/` is served directly as Cloudflare Worker static assets. No React app, old runtime, or workspace package is needed.

`public/preludes.html` catalogs every shipped Lisp source. The six guides in
`public/preludes/` distinguish domain imports, the default ontology language, and
compiler support. Edit these HTML files directly. Model examples are checked
against the Forma adapter in `test/prelude-pages.test.ts`; compiler excerpts are
checked against their source files. The site check inventories `libraries/` and
`preludes/` and validates the catalog, guides, and their local and repository links.

```sh
pnpm site:check
pnpm site:dev
```

The `open-ontology-site` Worker serves https://open-ontology.com. After `main` checks pass, `.github/workflows/deploy-site.yml` deploys the site with Wrangler. The two GitHub Actions secrets are described in the root README. There is no site build: `public/` is the deployment artifact, including the plain-text agent files. `pnpm check` includes the site checks.

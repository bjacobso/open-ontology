# Website

This static site preserves the layout and palette of the historical Open Ontology homepage at [`packages/web/app/routes/home.tsx`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.tsx) and [`home.css`](https://github.com/bjacobso/open-ontology-legacy/blob/7c2ff8a614b9f06a6e530aa80d0c7311dc81a323/packages/web/app/routes/home.css). Its content reflects the new repository's smaller package boundary and is written first for agents modeling a domain for someone: `public/llms-full.txt` is the complete authoring guide, and `public/llms.txt` is its index.

`public/` is served directly as Cloudflare Worker static assets. No React app, old runtime, or workspace package is needed.

```sh
pnpm site:check
pnpm site:dev
```

The deployment target is `open-ontology-site.bjacobso.workers.dev`, separate from the historical production Worker and custom domain. After `main` checks pass, `.github/workflows/deploy-site.yml` deploys the site with Wrangler. Configure the two GitHub Actions secrets described in the root README before enabling the first deployment.

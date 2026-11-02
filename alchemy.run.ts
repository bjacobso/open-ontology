import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Effect from "effect/Effect";

const siteProps = (stage: string) => ({
  name: stage === "prod" ? "open-ontology-site" : `open-ontology-site-${stage}`,
  compatibility: { date: "2026-09-27" },
  workersDev: true,
  assets: {
    directory: "./apps/site/public",
    notFoundHandling: "404-page" as const,
  },
  ...(stage === "prod" ? { domain: "open-ontology.com" } : {}),
});

export default Alchemy.Stack(
  "open-ontology",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state({ name: "open-ontology" }),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    // Take over the existing Wrangler Worker in place on the first prod deploy.
    const site = yield* Cloudflare.Worker("Site", siteProps(stage)).pipe(adopt(stage === "prod"));
    return { url: site.url };
  }),
);

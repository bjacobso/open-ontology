import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { AlchemyContextLive } from "alchemy/AlchemyContext";
import { provideFreshArtifactStore } from "alchemy/Artifacts";
import { makeOAuthClient } from "alchemy/Auth/OAuthFlow";
import { layerNonInteractive } from "alchemy/Interaction";
import * as Plan from "alchemy/Plan";
import { inMemoryState } from "alchemy/State/InMemoryState";
import { evalStack } from "alchemy/Stack";
import { checkHttpStateStoreAuth, makeHttpStateStore } from "alchemy/State/HttpStateStore";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { describe, expect, it, vi } from "vitest";

// Compile and plan the actual entrypoint, substituting only cloud I/O.
vi.mock("@alchemy.run/cloudflare", async (importOriginal) => {
  const cloudflare = await importOriginal<typeof import("@alchemy.run/cloudflare")>();
  const { inMemoryState } = await import("alchemy/State/InMemoryState");
  const Provider = await import("alchemy/Provider");
  return {
    ...cloudflare,
    state: () => inMemoryState(),
    providers: () => Provider.effect(cloudflare.Worker, Effect.succeed({
      read: () => Effect.succeed(undefined),
      reconcile: () => Effect.die("Tests must never deploy"),
      delete: () => Effect.die("Tests must never delete cloud resources"),
    })),
  };
});

import stack from "../alchemy.run.js";

describe("site deployment", () => {
  it.each(["prod", "pr-123", "pr-456"])("plans %s with the existing static routes", async (stage) => {
    const { compiled, plan } = await Effect.runPromise(
      evalStack(stack, (compiled) => Plan.make(compiled).pipe(
        Effect.map((plan) => ({ compiled, plan })),
      ), { stage }).pipe(
        Effect.provide(layerNonInteractive()),
        provideFreshArtifactStore,
        Effect.provide(AlchemyContextLive),
        Effect.provide(NodeServices.layer),
        Effect.provide(inMemoryState()),
      ),
    );
    const site = Object.values(compiled.resources);
    expect(site).toHaveLength(1);
    expect(site[0]!.Adopt).toBe(stage === "prod");
    const props = site[0]!.Props;
    expect(props).toMatchObject({
      name: stage === "prod" ? "open-ontology-site" : `open-ontology-site-${stage}`,
      assets: { directory: "./apps/site/public", notFoundHandling: "404-page" },
      compatibility: { date: "2026-09-27" },
      workersDev: true,
    });
    if (stage === "prod") expect(props).toHaveProperty("domain", "open-ontology.com");
    else expect(props).not.toHaveProperty("domain");
    expect(Object.values(plan.resources).map((node) => node.action)).toEqual(["create"]);
    const localConfig = JSON.parse(readFileSync("apps/site/wrangler.jsonc", "utf8"));
    expect(props.assets.notFoundHandling).toBe(localConfig.assets.not_found_handling);
    expect(props.compatibility.date).toBe(localConfig.compatibility_date);
  });
});

describe("Alchemy Effect 4.1 compatibility patch", () => {
  it("generates secure OAuth state and a matching S256 PKCE challenge without a Crypto service", async () => {
    const client = makeOAuthClient({
      clientId: "local-test",
      endpoints: { authorize: "https://auth.example/authorize", token: "https://auth.example/token" },
      redirectUri: "http://127.0.0.1:9999/callback",
      localCallbackUri: "http://127.0.0.1:9999/callback",
      auth: { kind: "pkce" },
    });
    const first = await Effect.runPromise(client.authorize(["read"]));
    const second = await Effect.runPromise(client.authorize(["read"]));
    expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).toMatch(/^[A-Za-z0-9_-]{128}$/);
    expect(first.verifier).not.toBe(second.verifier);
    const url = new URL(first.url);
    expect(url.searchParams.get("state")).toBe(first.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(first.verifier!).digest("base64url"),
    );
    const lib = dirname(createRequire(import.meta.url).resolve("alchemy"));
    for (const file of ["Auth/OAuthFlow", "Stack", "Util/PlatformServices"]) {
      expect(readFileSync(join(lib, `${file}.d.ts`), "utf8")).not.toContain("effect/Crypto");
      expect(readFileSync(join(lib, "../src", `${file}.ts`), "utf8")).not.toContain("effect/Crypto");
    }
  });

  it("authenticates and reads a PR URL through the HTTP state-store path", async () => {
    const requests: Array<{ url: string; authorization: string | undefined }> = [];
    const url = "https://open-ontology-site-pr-123.example.workers.dev";
    const client = HttpClient.make((request) => {
      requests.push({ url: request.url, authorization: request.headers.authorization });
      const payload = request.url.endsWith("/output") ? { url } : ["open-ontology"];
      return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(payload)));
    });
    const result = await Effect.runPromise(Effect.gen(function* () {
      const options = { url: "https://state.example", authToken: "test-token", id: "test" };
      expect(yield* checkHttpStateStoreAuth(options)).toBe(true);
      const store = yield* makeHttpStateStore(options);
      return yield* store.getOutput({ stack: "open-ontology", stage: "pr-123" });
    }).pipe(Effect.provideService(HttpClient.HttpClient, client)));
    expect(result).toEqual({ url });
    expect(requests).toEqual([
      { url: "https://state.example/state/stacks", authorization: "Bearer test-token" },
      { url: "https://state.example/state/stacks/open-ontology/stages/pr-123/output", authorization: "Bearer test-token" },
    ]);
  });
});

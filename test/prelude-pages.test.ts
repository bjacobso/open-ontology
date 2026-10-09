import { readFileSync, readdirSync } from "node:fs";
import { Effect } from "effect";
import { KvTriples } from "@triplex-build/triplex";
import { describe, expect, it } from "vitest";
import { checkFormaSource } from "../scripts/check-model.js";
import { makeOntologyRuntime, materializeOntology, ontologyToIR, toTriplexConfig } from "../src/index.js";

const pageDir = new URL("../apps/site/public/preludes/", import.meta.url);
const decodeHtml = (text: string): string => text.replace(/&(amp|lt|gt|quot|#x27);/g, (_, name: string) =>
  ({ amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'" })[name]!,
);
const pages = readdirSync(pageDir).map((name) => ({
  name,
  html: readFileSync(new URL(name, pageDir), "utf8"),
}));
const models = pages.flatMap(({ html }) =>
  [...html.matchAll(/<code[^>]*data-model-example="([^"]+)"[^>]*>([\s\S]*?)<\/code>/g)]
    .map(([, name, code]) => ({ name: name!, source: decodeHtml(code!) })),
);
const model = (name: string) => {
  const example = models.find((entry) => entry.name === name);
  if (!example) throw new Error(`Missing landing-page model ${name}`);
  return example.source;
};

describe("prelude landing-page examples", () => {
  it.each(models)("$name checks without warnings and produces portable runtime configuration", ({ name, source }) => {
    const checked = checkFormaSource(source, { name });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.ok).toBe(true);
    const ir = checked.ir!;
    expect(JSON.parse(JSON.stringify(ir))).toEqual(ir);
    expect(ontologyToIR(materializeOntology(ir))).toEqual(ir);
    expect(toTriplexConfig(ir).objectTypes.size).toBe(ir.objectTypes.length);
  });

  it("the task example removes completed tasks from the open query", async () => {
    const runtime = makeOntologyRuntime(checkFormaSource(model("ontology"), { name: "tasks" }).ir!);
    const result = await Effect.runPromise(Effect.gen(function* () {
      yield* runtime.invoke("open-task", { task: "task:catalog", title: "Ship the catalog" });
      const before = (yield* runtime.query("open-tasks")).results;
      yield* runtime.invoke("complete-task", { task: "task:catalog" });
      return { before, after: (yield* runtime.query("open-tasks")).results };
    }).pipe(Effect.provide(KvTriples.layer)));
    expect(result).toEqual({ before: [{ "?title": "Ship the catalog" }], after: [] });
  });

  it("the release example joins its own domain to imported Git facts", async () => {
    const runtime = makeOntologyRuntime(checkFormaSource(model("git"), { name: "releases" }).ir!);
    const oid = "a".repeat(40);
    const result = await Effect.runPromise(Effect.gen(function* () {
      yield* runtime.invoke("git-create-repository", { repository: "git:ontology", name: "ontology" });
      yield* runtime.invoke("git-record-commit", { commit: `git:sha1:${oid}`, oid, objectFormat: "sha1", message: "Initial model" });
      yield* runtime.invoke("record-release", { release: "release:0.1", name: "v0.1", repository: "git:ontology", commit: `git:sha1:${oid}` });
      return (yield* runtime.query("release-pins")).results;
    }).pipe(Effect.provide(KvTriples.layer)));
    expect(result).toEqual([{ "?release": "v0.1", "?repository": "ontology", "?oid": oid }]);
  });

  it("the GitHub example queries imported hosting, issues, and authors", async () => {
    const runtime = makeOntologyRuntime(checkFormaSource(model("github"), { name: "issues" }).ir!);
    const result = await Effect.runPromise(Effect.gen(function* () {
      yield* runtime.invoke("git-create-repository", { repository: "git:ontology", name: "ontology" });
      yield* runtime.invoke("github-record-account", { account: "github:ada", nodeId: "USER_ada", login: "ada", kind: "user" });
      yield* runtime.invoke("github-record-repository", {
        hosting: "github:ontology", nodeId: "REPO_ontology", repository: "git:ontology",
        owner: "github:ada", fullName: "ada/ontology", url: "https://github.com/ada/ontology",
      });
      yield* runtime.invoke("github-open-issue", {
        issue: "issue:ontology:1", repository: "github:ontology", number: 1,
        title: "Add the catalog", author: "github:ada",
      });
      return (yield* runtime.query("open-issues-by-author")).results;
    }).pipe(Effect.provide(KvTriples.layer)));
    expect(result).toEqual([{ "?repository": "ada/ontology", "?number": 1, "?title": "Add the catalog", "?author": "ada" }]);
  });

  it.each(pages.filter(({ html }) => html.includes("data-source-excerpt=")))(
    "$name quotes actual compiler source, with a label instead of a model example",
    ({ html }) => {
      const excerpts = [...html.matchAll(/<code[^>]*data-source-excerpt="([^"]+)"[^>]*>([\s\S]*?)<\/code>/g)];
      expect(excerpts.length).toBeGreaterThan(0);
      expect(html).toContain("Compiler source excerpt · not a model");
      expect(html).not.toContain("data-model-example=");
      for (const [, path, code] of excerpts) {
        const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
        expect(source).toContain(decodeHtml(code!));
      }
    },
  );
});

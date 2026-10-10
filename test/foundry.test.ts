import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineOntology } from "@osdk/maker";
import { afterAll, describe, expect, it } from "vitest";
import { compileOsdkMaker, elaborateFormaOntology } from "../src/index.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");
// Generated modules import @osdk/maker, so they must sit inside the repository to resolve it.
const scratch = mkdtempSync(join(repoRoot, ".foundry-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Run a generated module through @osdk/maker, as an Ontology as Code repository would. */
const loadWithMaker = async (name: string, source: string) => {
  const file = join(scratch, `${name}.ts`);
  writeFileSync(file, source);
  const ir = await defineOntology("com.example.", async () => {
    await import(pathToFileURL(file).href);
  }, undefined);
  return {
    objects: Object.keys(ir.ontology.objectTypes).sort(),
    links: Object.keys(ir.ontology.linkTypes).sort(),
    actions: Object.keys(ir.ontology.actionTypes).sort(),
  };
};

describe("Foundry Ontology as Code compiler", () => {
  it("matches the checked-in support-desk module", () => {
    const ir = elaborateFormaOntology(read("examples/support-desk/model.lisp"), { name: "support-desk" });
    const compiled = compileOsdkMaker(ir);
    expect(compiled.source).toBe(read("examples/support-desk/foundry/ontology.ts"));
    expect(compiled.diagnostics.map(({ declaration }) => declaration))
      .toEqual(["open-work", "escalations", "tickets-by-status"]);
  });

  it("compiles objects, reference links, link objects and actions that @osdk/maker accepts", async () => {
    const ir = elaborateFormaOntology(read("examples/support-desk/model.lisp"), { name: "support-desk" });
    expect(await loadWithMaker("support-desk", compileOsdkMaker(ir).source)).toEqual({
      objects: ["com.example.Customer", "com.example.Engineer", "com.example.EscalatedToLink", "com.example.Ticket"],
      links: ["escalated-to", "escalated-to-from", "escalated-to-to", "ticket-customer"],
      actions: ["com.example.close-ticket", "com.example.escalate-ticket", "com.example.open-ticket"],
    });
  });

  it.each([
    ["field-service", "examples/field-service/model.lisp", 3, 3, 1],
    ["github", "examples/github/model.lisp", 10, 23, 15],
  ])("compiles the %s example for @osdk/maker", async (name, path, objects, links, actions) => {
    const compiled = compileOsdkMaker(elaborateFormaOntology(read(path), { name }));
    expect(compiled.diagnostics.every(({ message }) => message.startsWith("Datalog queries"))).toBe(true);
    const loaded = await loadWithMaker(name, compiled.source);
    expect([loaded.objects.length, loaded.links.length, loaded.actions.length]).toEqual([objects, links, actions]);
  });

  it("keeps compound entity names whole and names reference links after their fields", () => {
    const { source } = compileOsdkMaker(elaborateFormaOntology('(import "/github")', { name: "github" }));
    expect(source).toContain('displayName: "GitHub Pull Request"');
    expect(source).toContain('apiName: "github-pull-request-base"');
    expect(source).toContain('apiName: "baseGitHubPullRequests"');
    expect(source).toContain('manyForeignKeyProperty: "headId"');
  });

  it("reports what Foundry cannot express and still emits a module @osdk/maker accepts", async () => {
    const ir = elaborateFormaOntology(`
(define-entity Link
  (:field [link/name String {:required true}])
  (:field [link/meta Json])
  (:field [link/tags (List String)])
  (:field [link/owners (List Person)]))
(define-entity Person (:field [person/name String {:required true}]))
(define-relation watches Person Link)
(define-action retire-link
  (:input [link String {:required true}])
  (:returns String)
  (:do (clear link :link/name)))
(define-action register-link
  (:input [link String {:required true}])
  (:input [person String {:required true}])
  (:returns String)
  (:do (changes
    (create Link link {:link/name "new" :link/tags "x"})
    (set link :link/name "renamed")
    (link watches person link)
    (set "person:fixed" :person/name "fixed"))))`, { name: "edge" });
    const compiled = compileOsdkMaker(ir);
    expect(compiled.diagnostics).toEqual([
      { severity: "warning", declaration: "Link", message: "Link is reserved in Foundry; it compiles to LinkType" },
      { severity: "warning", declaration: "Link", message: "Property :link/meta is Json; it compiles to a string holding JSON text" },
      { severity: "warning", declaration: "Link", message: "Property :link/owners holds many references; it compiles to an array of ids without a link type" },
      { severity: "warning", declaration: "register-link", message: "create Link writes many-valued tags; Foundry replaces whole arrays, so it was left out" },
      { severity: "warning", declaration: "register-link", message: "link watches needs two existing object parameters; it was left out" },
      { severity: "warning", declaration: "register-link", message: "set :person/name does not target an object parameter; it was left out" },
    ]);
    expect(compiled.source).toContain('name: { type: "staticValue", staticValue: { type: "null", null: {} } }');
    expect(compiled.source).toContain('name: { type: "staticValue", staticValue: { type: "string", string: "renamed" } }');
    expect(await loadWithMaker("edge", compiled.source)).toEqual({
      objects: ["com.example.LinkType", "com.example.Person"],
      links: ["watches"],
      actions: ["com.example.register-link", "com.example.retire-link"],
    });
  });
});

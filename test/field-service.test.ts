import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { EntityId, KvTriples, Triples, string } from "@triplex-build/triplex";
import { describe, expect, it } from "vitest";
import { elaborateFormaOntology, makeOntologyRuntime, ontologyToIR } from "../src/index.js";
import { fieldService } from "../examples/field-service/model.js";

const source = readFileSync(new URL("../examples/field-service/model.lisp", import.meta.url), "utf8");
const landing = readFileSync(new URL("../apps/site/public/index.html", import.meta.url), "utf8");
const landingCode = (attribute: string): string => {
  const block = landing.match(new RegExp(`<code[^>]*${attribute}="field-service"[^>]*>([\\s\\S]*?)</code>`))?.[1];
  if (!block) throw new Error(`Missing field-service ${attribute} on the landing page`);
  return block;
};

describe("field-service authoring", () => {
  it("shows a verbatim model excerpt on the landing page", () => {
    expect(source).toContain(landingCode("data-example"));
  });

  it("produces equivalent portable IR from TypeScript and Forma files", () => {
    expect(elaborateFormaOntology(source, { name: "field-service", version: "1" }))
      .toEqual(ontologyToIR(fieldService));
  });

  it("reports a source location for malformed Forma", () => {
    try {
      elaborateFormaOntology("(define-entity WorkOrder\n", { name: "invalid" });
      throw new Error("Expected a parse error");
    } catch (error) {
      expect(error).toMatchObject({ message: "Unclosed list", loc: { line: 1, col: 1 } });
    }
  });

  it("reports a source location for an invalid relation", () => {
    const invalid = `(define-entity WorkOrder (:field [work-order/title String]))
(define-relation assigned-to Missing WorkOrder)`;
    try {
      elaborateFormaOntology(invalid, { name: "invalid" });
      throw new Error("Expected a validation error");
    } catch (error) {
      expect(error).toMatchObject({
        message: "Link assigned-to has unknown endpoints Missing -> WorkOrder",
        loc: { line: 2, col: 1 },
      });
    }
  });

  it("runs an action and named query against local Triplex", async () => {
    const runtime = makeOntologyRuntime(elaborateFormaOntology(source, { name: "field-service", version: "1" }));
    const response = await Effect.runPromise(Effect.gen(function* () {
      const triples = yield* Triples;
      yield* triples.transact([
        { op: "assert", entityId: EntityId.make("technician:ada"), entityType: "Technician", attribute: ":technician/name", value: string("Ada") },
        { op: "assert", entityId: EntityId.make("work-order:42"), entityType: "WorkOrder", attribute: ":work-order/title", value: string("Repair cooling pump") },
        { op: "assert", entityId: EntityId.make("work-order:42"), entityType: "WorkOrder", attribute: ":work-order/status", value: string("open") },
      ]);
      yield* runtime.invoke("assign-work-order", { workOrder: "work-order:42", technician: "technician:ada" }, { actor: "dispatcher:grace", commandId: "assign:42", now: 1_800_000_000_000 });
      const statuses = yield* triples.queryAll({ find: ["?status"], where: [["work-order:42", ":work-order/status", "?status"]] });
      return { assigned: yield* runtime.query("assigned-work"), statuses };
    }).pipe(Effect.provide(KvTriples.layer)));
    expect(response.assigned.results).toEqual([{ "?title": "Repair cooling pump", "?technician": "Ada" }]);
    expect(response.assigned.results).toEqual(JSON.parse(landingCode("data-result")));
    // The action clears the old status before setting the new one, so only one value remains.
    expect(response.statuses.results).toEqual([{ "?status": "assigned" }]);
  });
});

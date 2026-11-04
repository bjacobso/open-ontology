import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import { EntityId, KvTriples, Triples, string } from "@triplex-build/triplex";
import { elaborateFormaOntology, makeOntologyRuntime, ontologyToIR } from "../../src/index.js";
import { fieldService } from "./model.js";

const source = await readFile(new URL("./model.lisp", import.meta.url), "utf8");
const tsIR = ontologyToIR(fieldService);
const formaIR = elaborateFormaOntology(source, { name: "field-service", version: "1" });
if (JSON.stringify(tsIR) !== JSON.stringify(formaIR)) {
  throw new Error("TypeScript and Forma ontology IR differ");
}

const runtime = makeOntologyRuntime(formaIR);
const response = await Effect.runPromise(
  Effect.gen(function* () {
    const triples = yield* Triples;
    yield* triples.transact([
      { op: "assert", entityId: EntityId.make("technician:ada"), entityType: "Technician", attribute: ":technician/name", value: string("Ada") },
      { op: "assert", entityId: EntityId.make("work-order:42"), entityType: "WorkOrder", attribute: ":work-order/title", value: string("Repair cooling pump") },
      { op: "assert", entityId: EntityId.make("work-order:42"), entityType: "WorkOrder", attribute: ":work-order/status", value: string("open") },
    ]);
    yield* runtime.invoke("assign-work-order", { workOrder: "work-order:42", technician: "technician:ada" }, { actor: "dispatcher:grace", commandId: "assign:42", now: 1_800_000_000_000 });
    return yield* runtime.query("assigned-work");
  }).pipe(Effect.provide(KvTriples.layer)),
);
console.log(JSON.stringify(response.results, null, 2));

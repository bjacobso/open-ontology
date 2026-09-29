import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import { EntityId, KvTriples, Triples, string } from "@triplex-build/triplex";
import { elaborateFormaOntology, makeOntologyRuntime } from "../../src/index.js";

const source = await readFile(new URL("./model.lisp", import.meta.url), "utf8");
const runtime = makeOntologyRuntime(elaborateFormaOntology(source, { name: "support-desk", version: "1" }));

const results = await Effect.runPromise(
  Effect.gen(function* () {
    const triples = yield* Triples;
    // Seed the facts that exist before any action runs.
    yield* triples.transact([
      { op: "assert", entityId: EntityId.make("customer:acme"), entityType: "Customer", attribute: ":customer/name", value: string("Acme") },
      { op: "assert", entityId: EntityId.make("engineer:lin"), entityType: "Engineer", attribute: ":engineer/name", value: string("Lin") },
    ]);
    const as = (commandId: string) => ({ actor: "agent:triage", commandId, now: 1_800_000_000_000 });
    yield* runtime.invoke("open-ticket", { ticket: "ticket:1", customer: "customer:acme", title: "VPN drops hourly", priority: 2 }, as("open:1"));
    yield* runtime.invoke("open-ticket", { ticket: "ticket:2", customer: "customer:acme", title: "Invoice PDF blank", priority: 1 }, as("open:2"));
    yield* runtime.invoke("open-ticket", { ticket: "ticket:3", customer: "customer:acme", title: "Password reset", priority: 3 }, as("open:3"));
    yield* runtime.invoke("escalate-ticket", { ticket: "ticket:1", engineer: "engineer:lin", reason: "Needs network access" }, as("escalate:1"));
    yield* runtime.invoke("close-ticket", { ticket: "ticket:3" }, as("close:3"));
    return {
      "open-work": (yield* runtime.query("open-work")).results,
      escalations: (yield* runtime.query("escalations")).results,
      "tickets-by-status": (yield* runtime.query("tickets-by-status")).results,
    };
  }).pipe(Effect.provide(KvTriples.layer)),
);
console.log(JSON.stringify(results, null, 2));

import { Effect } from "effect";
import { EntityId, KvTriples, Triples, ref, string } from "@triplex-build/triplex";
import { makeOntologyRuntime, ontologyToIR } from "../../src/index.js";
import { onboarded } from "./model.js";

/** Synthetic names and metadata only; no personal documents, external APIs, or persistence. */
export const runOnboardedScenario = () => {
  const runtime = makeOntologyRuntime(ontologyToIR(onboarded));
  return Effect.runPromise(Effect.gen(function* () {
    const triples = yield* Triples;
    yield* triples.transact([
      { op: "assert", entityId: EntityId.make("account:demo"), entityType: "Account", attribute: ":account/name", value: string("Example Co.") },
      { op: "assert", entityId: EntityId.make("employee:ada"), entityType: "Employee", attribute: ":employee/name", value: string("Ada Example") },
      { op: "assert", entityId: EntityId.make("employee:ada"), entityType: "Employee", attribute: ":employee/account", value: ref(EntityId.make("account:demo")) },
      { op: "assert", entityId: EntityId.make("reviewer:grace"), entityType: "Reviewer", attribute: ":reviewer/name", value: string("Grace Example") },
      { op: "assert", entityId: EntityId.make("membership:demo"), entityType: "Membership", attribute: ":membership/account", value: ref(EntityId.make("account:demo")) },
      { op: "assert", entityId: EntityId.make("membership:demo"), entityType: "Membership", attribute: ":membership/reviewer", value: ref(EntityId.make("reviewer:grace")) },
      { op: "assert", entityId: EntityId.make("membership:demo"), entityType: "Membership", attribute: ":membership/role", value: string("reviewer") },
    ]);
    const context = { actor: "agent:demo", now: 1_800_000_000_000 };
    yield* runtime.invoke("start-onboarding", { onboarding: "onboarding:ada", employee: "employee:ada" }, context);
    yield* triples.transact([
      { op: "assert", entityId: EntityId.make("document:demo"), entityType: "Document", attribute: ":document/onboarding", value: ref(EntityId.make("onboarding:ada")) },
      { op: "assert", entityId: EntityId.make("document:demo"), entityType: "Document", attribute: ":document/type", value: string("example-document") },
    ]);
    const before = {
      cases: (yield* runtime.query("onboarding-cases")).results,
      queue: (yield* runtime.query("review-queue")).results,
    };
    yield* runtime.invoke("request-review", { onboarding: "onboarding:ada", reviewer: "reviewer:grace" }, context);
    const after = {
      cases: (yield* runtime.query("onboarding-cases")).results,
      queue: (yield* runtime.query("review-queue")).results,
    };
    return { before, after };
  }).pipe(Effect.provide(KvTriples.layer)));
};

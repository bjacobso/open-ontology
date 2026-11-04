import { Effect } from "effect";
import { EntityId, KvTriples, Triples, ref, string, type TransactOp } from "@triplex-build/triplex";
import { toTriplexConfig } from "../../src/runtime.js";
import { elaborateHotel, lowerOnto, notLowered, seedOperations } from "./lower.js";
import { makeStoryHost, type StepResult } from "./guards.js";

export const arrival = Date.parse("2026-11-04T15:00:00Z");
export const reservationInput = {
  id: "reservation:1", guest: "guest:ada", name: "Ada's stay", "room-class": "room-class:2",
  room: "room:101", "check-in": arrival, "check-out": arrival + 3 * 86_400_000, invoice: "invoice:1",
};
export const serviceInput = {
  id: "service:1", kind: "spa", charge: 75, notes: "Evening appointment", reservation: "reservation:1",
};
export const setupHotel = () => Effect.gen(function* () {
  const result = elaborateHotel();
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  const ir = lowerOnto(result.declarations);
  const config = toTriplexConfig(ir);
  const nodes = yield* config.nodes;
  const triples = yield* Triples;
  yield* triples.transact(seedOperations(result.declarations), { actor: "system:seed", commandId: "seed:room-classes" });
  yield* triples.transact([
    { op: "assert", entityId: EntityId.make("guest:ada"), entityType: "Guest", attribute: ":guest/name", value: string("Ada") },
    { op: "assert", entityId: EntityId.make("room:101"), entityType: "Room", attribute: ":room/number", value: string("101") },
    { op: "assert", entityId: EntityId.make("room:101"), entityType: "Room", attribute: ":room/room-class", value: ref(EntityId.make("room-class:2")) },
    { op: "assert", entityId: EntityId.make("invoice:1"), entityType: "Invoice", attribute: ":invoice/reservation", value: ref(EntityId.make("reservation:1")) },
  ], { actor: "system:fixture", commandId: "seed:hotel" });
  return { ...makeStoryHost(result.declarations, ir), ir, notLowered: notLowered(result.declarations), configNodes: nodes.length };
});

export const setStatus = (owner: "Reservation" | "Service", id: string, value: string): readonly TransactOp[] => [
  { op: "retract-pattern", pattern: { entityId: EntityId.make(id), attribute: `:${owner.toLowerCase()}/status` } },
  { op: "assert", entityId: EntityId.make(id), entityType: owner, attribute: `:${owner.toLowerCase()}/status`, value: string(value) },
];

export const playHotel = () => Effect.gen(function* () {
  const host = yield* setupHotel();
  const triples = yield* Triples;
  const outcomes: StepResult[] = [];
  outcomes.push(yield* host.invoke("hotel-booking-submits", reservationInput,
    { actor: "guest:ada", commandId: "submit:1", now: arrival - 86_400_000 }));
  outcomes.push(yield* host.invoke("hotel-booking-confirms", { id: "reservation:1" },
    { actor: "system:booking", commandId: "confirm:1", now: arrival - 86_400_000 }));
  outcomes.push(yield* host.invoke("hotel-booking-checks-in", { id: "reservation:1" },
    { actor: "receptionist:lee", commandId: "check-in:early", now: arrival - 1 }));
  outcomes.push(yield* host.invoke("hotel-booking-checks-in", { id: "reservation:1" },
    { actor: "receptionist:lee", commandId: "check-in:1", now: arrival }));
  outcomes.push(yield* host.invoke("guest-services-requests", serviceInput,
    { actor: "guest:ada", commandId: "request:1", now: arrival }));
  // Onto declares two independent references; it does not specify automatic inverse maintenance.
  yield* triples.transact([
    { op: "assert", entityId: EntityId.make("reservation:1"), entityType: "Reservation", attribute: ":reservation/services", value: ref(EntityId.make("service:1")) },
  ], { actor: "system:fixture", commandId: "link:service" });
  const beforeFulfilment = (yield* host.runtime.query("service-charges")).results;
  outcomes.push(yield* host.invoke("guest-services-fulfils", { id: "service:1" },
    { actor: "concierge:sam", commandId: "fulfil:1", now: arrival }));
  // Reusing the creation sentence must never revive a fulfilled service.
  outcomes.push(yield* host.invoke("guest-services-requests", serviceInput,
    { actor: "guest:ada", commandId: "request:revive", now: arrival }));
  const charges = (yield* host.runtime.query("service-charges")).results;
  const dateOrder = (yield* host.runtime.query("check-out-after-check-in")).results;
  const roomClasses = (yield* triples.queryAll({ find: ["?name", "?rate"],
    where: [["?room", ":room-class/name", "?name"], ["?room", ":room-class/rate", "?rate"]],
    orderBy: [{ variable: "?rate", direction: "asc" }] })).results;
  const journal = (yield* triples.transactions()).transactions.map(({ actor, commandId }) => ({ actor, commandId }));
  return { outcomes, queries: { roomClasses, beforeFulfilment, "service-charges": charges, "check-out-after-check-in": dateOrder }, journal, notLowered: host.notLowered };
});

export const runHotel = () => Effect.runPromise(playHotel().pipe(Effect.provide(KvTriples.layer)));

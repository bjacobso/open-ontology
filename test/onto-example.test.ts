import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { EntityId, KvTriples, Triples } from "@triplex-build/triplex";
import { describe, expect, it } from "vitest";
import { elaborateHotel, hotelSource, lowerOnto, notLowered } from "../examples/onto/lower.js";
import { evaluate } from "../examples/onto/guards.js";
import { arrival, playHotel, reservationInput, serviceInput, setStatus, setupHotel } from "../examples/onto/scenario.js";

const run = <A, E>(program: Effect.Effect<A, E, Triples>) => Effect.runPromise(program.pipe(Effect.provide(KvTriples.layer)));
const options = (commandId: string) => ({ actor: "test:actor", commandId, now: arrival });

describe("external Onto language prelude", () => {
  it("elaborates all 17 declarations without diagnostics and golden-checks the JSON-safe IR", async () => {
    const result = elaborateHotel();
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.declarations).toHaveLength(17);
    await expect(JSON.stringify(lowerOnto(result.declarations), null, 2) + "\n")
      .toMatchFileSnapshot("./fixtures/onto-hotel.ir.json");
  });

  it("plays the story, queries fulfilled charges and records only accepted command identities", async () => {
    const result = await run(playHotel());
    expect(result.outcomes.map((o) => o.accepted)).toEqual([true, true, false, true, true, true, false]);
    expect(result.outcomes[2]?.reason).toContain("before?");
    expect(result.outcomes[6]?.reason).toBe("final Service.status: fulfilled");
    expect(result.queries.beforeFulfilment).toEqual([]); // Sparse aggregate: missing group means zero.
    expect(result.queries["service-charges"]).toEqual([{ "?reservation": "reservation:1", "?total": 75 }]);
    expect(result.queries["check-out-after-check-in"]).toEqual([{ "?reservation": "reservation:1" }]);
    expect(result.queries.roomClasses).toEqual([
      { "?name": "Standard", "?rate": 120 }, { "?name": "Deluxe", "?rate": 200 }, { "?name": "Suite", "?rate": 450 },
    ]);
    expect(result.journal).toContainEqual({ actor: "concierge:sam", commandId: "fulfil:1" });
    expect(result.journal.map((j) => j.commandId)).not.toContain("check-in:early");
    expect(result.journal.map((j) => j.commandId)).not.toContain("request:revive");
    expect(result.notLowered).toContain("rule check-out-after-check-in: satisfaction query only; no invariant enforcement");
    expect(result.notLowered).toContain("formula Invoice.total: no faithful Datalog lowering for this expression");
    expect(result).toEqual(JSON.parse(readFileSync(new URL("../examples/onto/output.json", import.meta.url), "utf8")));
  });

  const broken = [
    ["misspelled rule field", "reservation.check-in", "reservation.checkin", "elaborate/hole-type", "error", /no field checkin.*did you mean check-in/],
    ["formula path returns a name", "invoice.reservation.room-class.rate", "invoice.reservation.room-class.name", "elaborate/hole-type", "error", /mismatch/i],
    ["unknown set state", ":sets {:status :checked-in}", ":sets {:status :checked_in}", "onto/unknown-state", "error", /checked_in/],
    ["unknown guard state", "(is? reservation.status :confirmed)", "(is? reservation.status :confirmd)", "onto/unknown-state", "error", /requested.*confirmed.*declined.*checked-in.*checked-out/],
    ["creation without new", ":new true", "", "onto/unguarded-transition", "warning", /final state/],
    ["unknown link", ":room (One Room)", ":room (One Suite)", "onto/unknown-link", "error", /Suite/],
    ["wrong formula result type", "(formula Invoice total Int", "(formula Invoice total String", "elaborate/hole-type", "error", /String.*Int/],
    ["unknown step object", "(step Concierge fulfils Service", "(step Concierge fulfils Booking", "elaborate/hole-type", "error", /Unknown reference.*Booking/],
    ["unknown seed field", ":rate 200", ":price 200", "onto/unknown-field", "error", /price/],
  ] as const;
  it.each(broken)("diagnoses %s by code and severity", (_name, before, after, code, severity, message) => {
    expect(hotelSource).toContain(before);
    const result = elaborateHotel(hotelSource.replace(before, after));
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code, severity, message: expect.stringMatching(message) })]));
    if (code === "onto/unknown-link") expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "elaborate/hole-type", message: expect.stringMatching(/Unknown type.*Suite/) }),
    ]));
    expect(result.ok).toBe(severity === "warning");
  });

  it.each(["declined", "checked-out"])("does not revive a final reservation (%s)", async (status) => {
    await run(Effect.gen(function* () {
      const host = yield* setupHotel();
      const triples = yield* Triples;
      yield* host.invoke("hotel-booking-submits", reservationInput, options("submit"));
      yield* triples.transact(setStatus("Reservation", "reservation:1", status));
      const result = yield* host.invoke("hotel-booking-submits", reservationInput, options("revive"));
      expect(result).toMatchObject({ accepted: false, reason: `final Reservation.status: ${status}` });
      expect(yield* triples.transactionByCommand("revive")).toBeNull();
    }));
  });

  it("rejects check-in before confirmation and missing or reused create targets", async () => {
    await run(Effect.gen(function* () {
      const host = yield* setupHotel();
      expect(yield* host.invoke("hotel-booking-submits", { ...reservationInput, "room-class": "room-class:missing" }, options("missing")))
        .toMatchObject({ accepted: false, reason: expect.stringContaining("known?") });
      yield* host.invoke("hotel-booking-submits", reservationInput, options("submit"));
      expect(yield* host.invoke("hotel-booking-checks-in", { id: "reservation:1" }, options("unconfirmed")))
        .toMatchObject({ accepted: false, reason: expect.stringContaining("confirmed") });
      expect(yield* host.invoke("hotel-booking-submits", reservationInput, options("duplicate")))
        .toMatchObject({ accepted: false, reason: "record already exists" });
    }));
  });

  it.each(["target", "linked", "absent"] as const)("atomically rejects a stale %s entity snapshot without a journal entry", async (which) => {
    await run(Effect.gen(function* () {
      const host = yield* setupHotel();
      const triples = yield* Triples;
      yield* host.invoke("hotel-booking-submits", reservationInput, options("submit"));
      yield* host.invoke("hotel-booking-confirms", { id: "reservation:1" }, options("confirm"));
      const mutateReservation = triples.transact(setStatus("Reservation", "reservation:1", "declined")).pipe(Effect.orDie, Effect.asVoid);
      let outcome;
      if (which === "target") {
        outcome = yield* host.invoke("hotel-booking-checks-in", { id: "reservation:1" }, options("stale"), mutateReservation);
      } else {
        yield* host.invoke("hotel-booking-checks-in", { id: "reservation:1" }, options("check-in"));
        const mutate = which === "linked" ? mutateReservation
          : triples.transact(setStatus("Service", "service:1", "fulfilled")).pipe(Effect.orDie, Effect.asVoid);
        outcome = yield* host.invoke("guest-services-requests", serviceInput, options("stale"), mutate);
      }
      expect(outcome).toMatchObject({ accepted: false, reason: "concurrent entity change; retry from fresh state" });
      expect(yield* triples.transactionByCommand("stale")).toBeNull();
      const service = yield* triples.entity(EntityId.make("service:1"));
      expect(service.some((t) => t.attribute === ":service/charge")).toBe(false);
    }));
  });

  it("queries the date rule without pretending it is a write-time invariant", async () => {
    await run(Effect.gen(function* () {
      const host = yield* setupHotel();
      const result = yield* host.invoke("hotel-booking-submits",
        { ...reservationInput, "check-out": arrival - 86_400_000 }, options("invalid-dates"));
      expect(result.accepted).toBe(true);
      expect((yield* host.runtime.query("check-out-after-check-in")).results).toEqual([]);
    }));
  });

  it("reports a formula whose implementation changes instead of silently using the old query", () => {
    const result = elaborateHotel(hotelSource.replace('(is? s.status :fulfilled)', '(is? s.status :requested)'));
    expect(result.diagnostics).toEqual([]);
    expect(lowerOnto(result.declarations).queryTypes.map((q) => q.name)).toEqual(["check-out-after-check-in"]);
    expect(notLowered(result.declarations)).toContain("formula Reservation.service-charges: no faithful Datalog lowering for this expression");
  });

  it("interprets the vocabulary, lists, closures and formula arithmetic", () => {
    const scope = { now: arrival, reservation: { status: "confirmed", "check-in": arrival, services: [
      { charge: 20, status: "fulfilled" }, { charge: 80, status: "requested" },
    ] } };
    expect(evaluate(["and", ["known?", "reservation"], ["in?", "reservation.status", [":requested", ":confirmed"]],
      ["or", ["before?", "now", "reservation.check-in"], ["not", ["after?", "now", "reservation.check-in"]]]], scope)).toBe(true);
    const formula = elaborateHotel().declarations.find((d) => (d.payload as Record<string, unknown>)["field"] === "service-charges")!;
    expect(evaluate((formula.payload as Record<string, unknown>)["body"], scope)).toBe(20);
    expect(evaluate(["+", ["*", ["days-between", "start", "end"], 200], 75], { start: arrival, end: arrival + 3 * 86_400_000 })).toBe(675);
    expect(evaluate(["-", ["/", 12, 3], 1], {})).toBe(3);
    expect(evaluate(["days-between", "start", "end"], { start: 0, end: 1.5 * 86_400_000 })).toBe(1);
    expect(() => evaluate(["unknown", 1], {})).toThrow("Unsupported Onto expression");
  });
});

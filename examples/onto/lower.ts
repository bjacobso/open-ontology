import { readFileSync } from "node:fs";
import { bootstrapFromSources, elaborateSources, type ElaboratedDeclaration } from "@open-ontology/onto-forma/descriptor";
import { preludeSource } from "@open-ontology/onto-forma/preludes";
import {
  EntityId, boolean, datetime, number, ref, string, type TransactOp, type TripleValue,
} from "@triplex-build/triplex";
import type { ActionTypeIR, OntologyIR, OntologyValueTypeIR, PropertyIR, QueryTypeIR } from "../../src/ir.js";

export interface Field {
  readonly name: string;
  readonly type: unknown;
  readonly link?: string;
  readonly many: boolean;
  readonly states?: readonly string[];
  readonly final: readonly string[];
}
export interface Noun {
  readonly kind: "Actor" | "Object";
  readonly name: string;
  readonly doc: string;
  readonly fields: readonly Field[];
}
export interface Expression {
  readonly kind: "raw-expr";
  readonly expr: unknown;
}
export interface Step {
  readonly kind: "Step";
  readonly actor: string;
  readonly verb: string;
  readonly object: string;
  readonly counterpart?: string;
  readonly creates: boolean;
  readonly requires: readonly Expression[];
  readonly sets: readonly { readonly field: string; readonly value: string }[];
}
type Declaration = Noun
  | { readonly kind: "Project"; readonly name: string; readonly doc: string }
  | { readonly kind: "Story"; readonly name: string; readonly doc: string; readonly steps: readonly Step[] }
  | { readonly kind: "Seed"; readonly of: string; readonly rows: readonly Readonly<Record<string, unknown>>[] }
  | { readonly kind: "Rule"; readonly name: string; readonly of: string; readonly holds: Expression }
  | { readonly kind: "Formula"; readonly of: string; readonly field: string; readonly body: Expression };

export const ontoPrelude = readFileSync(new URL("./onto.lisp", import.meta.url), "utf8");
export const hotelSource = readFileSync(new URL("./hotel.forma", import.meta.url), "utf8");
const prelude = bootstrapFromSources(preludeSource("compiler.lisp"), ontoPrelude);
export const elaborateHotel = (source = hotelSource) =>
  elaborateSources([{ sourceId: "hotel.forma", source }], { prelude });

export const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
export const attribute = (owner: string, field: string): `:${string}/${string}` => `:${kebab(owner)}/${field}`;
export const declarationsOf = (declarations: readonly ElaboratedDeclaration[]): readonly Declaration[] =>
  declarations.map(({ payload }) => payload as unknown as Declaration);
export const nounsOf = (declarations: readonly ElaboratedDeclaration[]): readonly Noun[] =>
  declarationsOf(declarations).filter((d): d is Noun => d.kind === "Actor" || d.kind === "Object");
export const stepsOf = (declarations: readonly ElaboratedDeclaration[]) =>
  declarationsOf(declarations).flatMap((d) => d.kind === "Story"
    ? d.steps.map((step) => ({ name: `${kebab(d.name)}-${step.verb}`, step })) : []);

const valueType = (field: Field): OntologyValueTypeIR => {
  if (field.link) return { kind: "ref", target: field.link };
  if (field.states || field.type === "String") return { kind: "string" };
  if (field.type === "Int") return { kind: "number" };
  if (field.type === "Instant") return { kind: "datetime" };
  if (field.type === "Bool") return { kind: "boolean" };
  throw new TypeError(`Unsupported Onto field type: ${JSON.stringify(field.type)}`);
};
const property = (owner: string, field: Field): PropertyIR => ({
  name: field.name, key: attribute(owner, field.name), valueType: valueType(field),
  required: false, cardinality: field.many ? "many" : "one", unique: false,
});

const lowerStep = (name: string, step: Step, nouns: readonly Noun[]): ActionTypeIR => {
  const noun = nouns.find((n) => n.name === step.object);
  if (!noun) throw new TypeError(`Unknown step object ${step.object}`);
  // Create inputs supply the single-valued facts. Collection membership remains explicit facts.
  const fields = step.creates ? noun.fields.filter((f) => !f.many && !step.sets.some((s) => s.field === f.name)) : [];
  const id = { kind: "input" as const, name: "id" };
  return {
    kind: "action-type", name,
    input: [{ name: "id", valueType: { kind: "string" } },
      ...fields.map((f) => ({ name: f.name, valueType: valueType(f) }))],
    changes: step.creates ? [{
      kind: "create-object", objectType: step.object, id,
      properties: Object.fromEntries([
        ...fields.map((f) => [attribute(step.object, f.name), { kind: "input", name: f.name }]),
        ...step.sets.map((s) => [attribute(step.object, s.field), s.value]),
      ]),
    }] : step.sets.flatMap((s) => [
      { kind: "clear-property" as const, object: id, property: attribute(step.object, s.field) },
      { kind: "set-property" as const, object: id, property: attribute(step.object, s.field), value: s.value },
    ]),
  };
};

// Match the expression, not just the formula name: a changed body must be reported.
const serviceCharges = ["sum", ["map", ["fn", ["s"], "s.charge"],
  ["filter", ["fn", ["s"], ["is?", "s.status", ":fulfilled"]], "reservation.services"]]];
const supportsRule = (d: Declaration) => d.kind === "Rule" && d.of === "Reservation"
  && d.name === "check-out-after-check-in" && JSON.stringify(d.holds.expr)
    === JSON.stringify(["after?", "reservation.check-out", "reservation.check-in"]);
const supportsFormula = (d: Declaration) => d.kind === "Formula" && d.of === "Reservation"
  && d.field === "service-charges" && JSON.stringify(d.body.expr) === JSON.stringify(serviceCharges);

/** Pure third-party language IR → portable ontology IR. No reads or writes. */
export const lowerOnto = (declarations: readonly ElaboratedDeclaration[]): OntologyIR => {
  const ds = declarationsOf(declarations);
  const project = ds.find((d) => d.kind === "Project");
  if (!project) throw new TypeError("An Onto model needs a project");
  const nouns = nounsOf(declarations);
  return {
    kind: "ontology", name: project.name, version: "1",
    objectTypes: nouns.map((n) => ({ kind: "object-type", name: n.name, description: n.doc,
      properties: n.fields.map((f) => property(n.name, f)) })),
    linkTypes: [],
    actionTypes: stepsOf(declarations).map(({ name, step }) => lowerStep(name, step, nouns)),
    queryTypes: ds.flatMap((d): readonly QueryTypeIR[] => {
      if (supportsRule(d)) return [{
        kind: "query-type", name: "check-out-after-check-in",
        description: "Reservations satisfying the date-order rule; observation only, not invariant enforcement.",
        query: { find: ["?reservation"], where: [
          ["?reservation", ":reservation/check-in", "?checkIn"],
          ["?reservation", ":reservation/check-out", "?checkOut"], [">", "?checkOut", "?checkIn"],
        ] },
      }];
      if (supportsFormula(d)) return [{
        kind: "query-type", name: "service-charges",
        description: "Sum of fulfilled service charges by reservation; absent groups mean zero.",
        query: {
          find: ["?reservation", "?total"],
          where: [["?reservation", ":reservation/services", "?service"],
            ["?service", ":service/status", "fulfilled"], ["?service", ":service/charge", "?charge"]],
          aggregate: [["sum", "?charge", "?total"]],
        },
      }];
      return [];
    }),
  };
};

/** Features retained in language IR but absent from the portable executable contract. */
export const notLowered = (declarations: readonly ElaboratedDeclaration[]): readonly string[] =>
  declarationsOf(declarations).flatMap((d) => {
    if (d.kind === "Rule") return [supportsRule(d)
      ? `rule ${d.name}: satisfaction query only; no invariant enforcement`
      : `rule ${d.name}: checked as Bool; no faithful Datalog lowering or invariant enforcement`];
    if (d.kind === "Formula" && !supportsFormula(d)) return [`formula ${d.of}.${d.field}: no faithful Datalog lowering for this expression`];
    return [];
  }).concat([
    "requires and final states: example host guards, absent from ActionTypeIR",
    "actor type, joins and counterpart: descriptive only; no identity or authorization enforcement",
    "Union members: checked by the prelude; stored as strings without runtime enum constraints",
    "Many references: schema retained; membership facts must be transacted explicitly",
  ]);

export const encode = (field: Field, value: unknown): TripleValue => {
  switch (valueType(field).kind) {
    case "ref": return ref(EntityId.make(String(value)));
    case "number": return number(Number(value));
    case "datetime": return datetime(typeof value === "number" ? value : Date.parse(String(value)));
    case "string": return string(String(value));
    case "boolean": return boolean(Boolean(value));
    default: throw new TypeError(`Unsupported seed value for ${field.name}`);
  }
};
/** Stable seed ids are row-index based, e.g. room-class:2 is Deluxe. */
export const seedOperations = (declarations: readonly ElaboratedDeclaration[]): readonly TransactOp[] => {
  const nouns = nounsOf(declarations);
  return declarationsOf(declarations).flatMap((d) => {
    if (d.kind !== "Seed") return [];
    const noun = nouns.find((n) => n.name === d.of)!;
    return d.rows.flatMap((row, i) => Object.entries(row).flatMap(([name, value]) => {
      const field = noun.fields.find((f) => f.name === name);
      if (!field) throw new TypeError(`Unknown seed field ${name}`);
      return (field.many ? value as readonly unknown[] : [value]).map((v): TransactOp => ({
        op: "assert", entityId: EntityId.make(`${kebab(d.of)}:${i + 1}`), entityType: d.of,
        attribute: attribute(d.of, name), value: encode(field, v),
      }));
    }));
  });
};

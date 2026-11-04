import { Effect } from "effect";
import { EntityId, Triples, type TransactionPrecondition, type Triple } from "@triplex-build/triplex";
import { makeOntologyRuntime } from "../../src/runtime.js";
import type { OntologyIR } from "../../src/ir.js";
import type { ElaboratedDeclaration } from "@open-ontology/onto-forma/descriptor";
import { attribute, nounsOf, stepsOf, type Expression } from "./lower.js";

type View = Readonly<Record<string, unknown>>;
const numeric = (x: unknown): number => {
  if (typeof x !== "number" || !Number.isFinite(x)) throw new TypeError("Expected a finite number");
  return x;
};
const instant = (x: unknown): number => numeric(typeof x === "string" ? Date.parse(x) : x);
const list = (x: unknown): readonly unknown[] => {
  if (!Array.isArray(x)) throw new TypeError("Expected a list");
  return x;
};

/** Interpreter for canonical RuntimeExpr data; no eval, host calls, or Forma compiler workarounds. */
export const evaluate = (expression: unknown, scope: View): unknown => {
  if (expression !== null && typeof expression === "object" && !Array.isArray(expression)) {
    const value = expression as Record<string, unknown>;
    if (value["kind"] === "raw-expr") return evaluate(value["expr"], scope);
    if (value["$forma.runtimeExpr"] === "string-literal") return value["value"];
    throw new TypeError("Unknown expression object");
  }
  if (typeof expression === "string") {
    if (expression.startsWith(":")) return expression.slice(1);
    return expression.split(".").reduce<unknown>((v, key) =>
      v !== null && typeof v === "object" ? (v as View)[key] : undefined, scope);
  }
  if (!Array.isArray(expression)) return expression;
  if (expression.length === 0 || typeof expression[0] !== "string" || expression[0].startsWith(":")) {
    return expression.map((x) => evaluate(x, scope));
  }
  const [op, ...args] = expression as [string, ...unknown[]];
  const at = (i: number) => evaluate(args[i], scope);
  switch (op) {
    case "and": return args.every((x) => evaluate(x, scope) === true);
    case "or": return args.some((x) => evaluate(x, scope) === true);
    case "not": return at(0) !== true;
    case "=": case "is?": return at(0) === at(1);
    case "known?": return at(0) !== undefined && at(0) !== null;
    case "in?": return list(at(1)).includes(at(0));
    case "before?": return instant(at(0)) < instant(at(1));
    case "after?": return instant(at(0)) > instant(at(1));
    case "days-between": return Math.floor((instant(at(1)) - instant(at(0))) / 86_400_000);
    case "sum": return list(at(0)).reduce<number>((sum, x) => sum + numeric(x), 0);
    case "+": return args.reduce<number>((sum, x) => sum + numeric(evaluate(x, scope)), 0);
    case "*": return args.reduce<number>((product, x) => product * numeric(evaluate(x, scope)), 1);
    case "-": return args.length === 1 ? -numeric(at(0)) : numeric(at(0)) - numeric(at(1));
    case "/": return numeric(numeric(at(0)) / numeric(at(1)));
    case "map": case "filter": {
      const fn = args[0];
      if (!Array.isArray(fn) || fn[0] !== "fn" || !Array.isArray(fn[1]) || typeof fn[1][0] !== "string") {
        throw new TypeError(`${op} expects a single-argument fn`);
      }
      const parameter = fn[1][0];
      const apply = (x: unknown) => evaluate(fn[2], { ...scope, [parameter]: x });
      return op === "map" ? list(at(1)).map(apply) : list(at(1)).filter((x) => apply(x) === true);
    }
    default: throw new TypeError(`Unsupported Onto expression: ${op}`);
  }
};

export type StepResult = {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly commandId: string;
};

/** Guard every observed entity (including absence) and pass preconditions at the Triples boundary. */
export const makeStoryHost = (declarations: readonly ElaboratedDeclaration[], ir: OntologyIR) => {
  const runtime = makeOntologyRuntime(ir);
  const nouns = nounsOf(declarations);
  const steps = stepsOf(declarations);
  return {
    runtime,
    invoke: (name: string, input: View, options: { readonly actor: string; readonly commandId: string; readonly now: number },
      beforeCommit?: Effect.Effect<void, never, Triples>) => Effect.gen(function* () {
      const step = steps.find((s) => s.name === name)?.step;
      if (!step) throw new TypeError(`Unknown story step ${name}`);
      const triples = yield* Triples;
      const snapshots = new Map<string, readonly Triple[]>();
      const read = (id: string) => Effect.gen(function* () {
        const cached = snapshots.get(id);
        if (cached) return cached;
        const facts = yield* triples.entity(EntityId.make(id));
        snapshots.set(id, facts);
        return facts;
      });
      const view = (owner: string, id: string, depth: number, initial?: View): Effect.Effect<View | undefined, unknown> =>
        Effect.gen(function* () {
          const facts = yield* read(id);
          if (!initial && facts.length === 0) return undefined;
          const noun = nouns.find((n) => n.name === owner)!;
          const record: Record<string, unknown> = {};
          for (const field of noun.fields) {
            const stored = facts.filter((f) => f.attribute === attribute(owner, field.name)).map((f) => f.value.value);
            const values = initial && field.name in initial
              ? field.many ? list(initial[field.name]) : [initial[field.name]] : stored;
            const resolved: unknown[] = [];
            for (const value of values) {
              resolved.push(field.link && depth > 0 ? yield* view(field.link, String(value), depth - 1) : value);
            }
            record[field.name] = field.many ? resolved : resolved[0];
          }
          return record;
        });
      const id = String(input["id"]);
      const current = yield* read(id);
      const refuse = (reason: string): StepResult => ({ accepted: false, reason, commandId: options.commandId });
      const noun = nouns.find((n) => n.name === step.object)!;
      // Check terminal states before creation/guard checks, including attempts to reuse a create step.
      for (const set of step.sets) {
        const field = noun.fields.find((f) => f.name === set.field)!;
        const value = current.find((f) => f.attribute === attribute(noun.name, field.name))?.value.value;
        if (field.final.includes(String(value)) && value !== set.value) return refuse(`final ${noun.name}.${field.name}: ${value}`);
      }
      if (step.creates && current.length > 0) return refuse("record already exists");
      if (!step.creates && current.length === 0) return refuse("record does not exist");
      const record = yield* view(step.object, id, 3, step.creates ? input : undefined);
      const scope = { [step.object.toLowerCase()]: record, now: options.now };
      const failed = step.requires.find((e: Expression) => evaluate(e, scope) !== true);
      if (failed) return refuse(`requires ${JSON.stringify(failed.expr)}`);
      const preconditions: readonly TransactionPrecondition[] = [...snapshots].map(([entityId, facts]) => ({
        _tag: "EntityState", entityId: EntityId.make(entityId), tripleIds: facts.map((f) => f.id),
      }));
      if (beforeCommit) yield* beforeCommit;
      // invoke() does not forward preconditions. A scoped service decorator adds them to its actual write.
      const receipt = yield* runtime.invoke(name, input, options).pipe(Effect.provideService(Triples, {
        ...triples,
        transact: (operations, meta) => triples.transact(operations, {
          ...meta, preconditions: [...(meta?.preconditions ?? []), ...preconditions],
        }),
      }), Effect.result);
      if (receipt._tag === "Failure") {
        if (receipt.failure._tag === "TransactionConflictError") return refuse("concurrent entity change; retry from fresh state");
        return yield* Effect.fail(receipt.failure);
      }
      return { accepted: true, commandId: options.commandId } satisfies StepResult;
    }),
  };
};

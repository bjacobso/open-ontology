/** Opt-in Forma extension. The stable elaborator still rejects define-skill. */
import { parse, toSExprMany, type SExpr } from "@formalang/ts/reader";
import { elaborateFormaOntology } from "../forma.js";
import { defineSkillModel } from "./skills.js";
import type { SkillIR, SkillLiteralIR, SkillStepIR, SkillValueIR } from "./skills-ir.js";

const fail = (message: string, expression?: SExpr): never => {
  throw Object.assign(new TypeError(message), expression ? { loc: expression.loc } : {});
};
const symbol = (expression?: SExpr): string =>
  expression?._tag === "Sym" ? expression.name : fail("Expected a symbol", expression);
const text = (expression?: SExpr): string =>
  expression?._tag === "Str" ? expression.value : fail("Expected a quoted string", expression);
const literal = (expression: SExpr): SkillLiteralIR => {
  if (expression._tag === "Str" || expression._tag === "Num" || expression._tag === "Bool") return expression.value;
  if (expression._tag === "Sym" && expression.name === "nil") return null;
  return fail("Expected a scalar literal", expression);
};
const argument = (expression: SExpr): SkillValueIR =>
  expression._tag === "Sym" && expression.name !== "nil"
    ? { kind: "input", name: expression.name } : literal(expression);

const record = <T>(expression: SExpr | undefined, convert: (value: SExpr) => T): Readonly<Record<string, T>> => {
  if (expression?._tag !== "Map") return fail("Expected an input map", expression);
  const pairs: [string, T][] = [];
  const seen = new Set<string>();
  for (const [key, value] of expression.pairs) {
    const name = symbol(key);
    if (!name.startsWith(":")) fail("Input map keys must be keywords", key);
    if (seen.has(name)) fail(`Duplicate input map key ${name}`, key);
    seen.add(name);
    pairs.push([name.slice(1), convert(value)]);
  }
  return Object.fromEntries(pairs);
};

const skillFromForm = (expression: SExpr): SkillIR => {
  if (expression._tag !== "List") return fail("Expected define-skill", expression);
  const name = symbol(expression.items[1]);
  let purpose = "";
  let inputs: readonly string[] = [];
  const preconditions: string[] = [];
  const steps: SkillStepIR[] = [];
  const examples: SkillIR["examples"][number][] = [];
  const singletons = new Set<string>();
  for (const slot of expression.items.slice(2)) {
    if (slot._tag !== "List") return fail("Skill slots must be lists", slot);
    const key = symbol(slot.items[0]);
    const args = slot.items.slice(1);
    const arity = key === ":guard" || key === ":action" ? 3
      : key === ":query" || key === ":example" ? 2 : 1;
    if (args.length !== arity) fail(`Skill slot ${key} expects ${arity} argument(s)`, slot);
    if (key === ":purpose" || key === ":inputs") {
      if (singletons.has(key)) fail(`Duplicate skill slot ${key}`, slot);
      singletons.add(key);
    }
    switch (key) {
      case ":purpose": purpose = text(args[0]); break;
      case ":inputs": {
        const vector = args[0];
        if (vector?._tag !== "Vector") return fail(":inputs requires a vector of names", vector);
        inputs = vector.items.map(symbol);
        break;
      }
      case ":precondition": preconditions.push(text(args[0])); break;
      case ":query": steps.push({ kind: "query", query: symbol(args[0]), instruction: text(args[1]) }); break;
      case ":guard": {
        const expect = symbol(args[1]);
        if (expect !== "empty" && expect !== "nonempty") return fail("Guard expects empty or nonempty", args[1]);
        steps.push({ kind: "guard", query: symbol(args[0]), expect, instruction: text(args[2]) });
        break;
      }
      case ":action": steps.push({ kind: "action", action: symbol(args[0]), input: record(args[1], argument), instruction: text(args[2]) }); break;
      case ":stop": steps.push({ kind: "stop", instruction: text(args[0]) }); break;
      case ":example": examples.push({ input: record(args[0], literal), description: text(args[1]) }); break;
      default: fail(`Unknown skill slot ${key}`, slot);
    }
  }
  return { kind: "agent-skill", name, purpose, inputs, preconditions, steps, examples };
};

/** Replace skill spans with spaces, preserving core errors' offsets, lines, and columns. */
export const splitSkillForms = (source: string): {
  readonly coreSource: string;
  readonly skills: readonly SkillIR[];
} => {
  const parsed = parse(source);
  if (parsed.errors.length) throw parsed.errors[0];
  const forms = toSExprMany(parsed.redTree);
  const skills: SkillIR[] = [];
  let coreSource = "";
  let end = 0;
  for (const form of forms) {
    if (form._tag !== "List" || form.items[0]?._tag !== "Sym" || form.items[0].name !== "define-skill") continue;
    const skill = skillFromForm(form);
    skills.push(skill);
    coreSource += source.slice(end, form.loc.start);
    coreSource += source.slice(form.loc.start, form.loc.end).replace(/[^\r\n]/g, " ");
    end = form.loc.end;
  }
  coreSource += source.slice(end);
  return { coreSource, skills };
};

export const elaborateFormaSkillModel = (
  source: string,
  options: { readonly name: string; readonly version?: string },
) => {
  const { coreSource, skills } = splitSkillForms(source);
  return defineSkillModel(elaborateFormaOntology(coreSource, options), skills);
};

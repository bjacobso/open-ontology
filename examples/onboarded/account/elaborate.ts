import { parse, toSExprMany, type SExpr } from "@formalang/ts/reader";
import type {
  Account, AccountProgram, Attribute, AttributeType, Automation, Comparison, Declaration, Diagnostic,
  EmailExpectation, Entity, Expectation, Field, FieldTarget, Form, Formula, Group, Integration, Loc, Page,
  Param, Policy, Rule, Scalar, Scenario, ScenarioAction, Step, Trigger, Value,
} from "./model.js";

type Sym = Extract<SExpr, { _tag: "Sym" }>;

class AccountError extends Error {
  constructor(message: string, readonly loc?: Loc) {
    super(message);
  }
}

/** A reference to a declaration that already failed; its own error is the one worth reading. */
class Cascade extends AccountError {}

function fail(node: SExpr | undefined, message: string, fallback?: Loc): never {
  throw new AccountError(message, node?.loc ?? fallback);
}

const isSym = (node: SExpr | undefined): node is Sym => node?._tag === "Sym";
const keywordOf = (node: SExpr | undefined): string | undefined =>
  isSym(node) && node.name.startsWith(":") ? node.name.slice(1) : undefined;
const isWord = (node: SExpr | undefined): node is Sym => isSym(node) && !node.name.startsWith(":");
const isPath = (node: SExpr | undefined): boolean => isWord(node) && node.name.includes(".");
const headOf = (node: SExpr | undefined): string | undefined =>
  node?._tag === "List" && isSym(node.items[0]) ? node.items[0].name : undefined;
const show = (node: SExpr): string => {
  switch (node._tag) {
    case "Sym": return node.name;
    case "Str": return JSON.stringify(node.value);
    case "Num": case "Bool": return String(node.value);
    default: return node._tag.toLowerCase();
  }
};

const distance = (a: string, b: string): number => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
};

const suggest = (name: string, candidates: Iterable<string>, prefix = ""): string => {
  let best: string | undefined;
  let bestDistance = Math.max(2, Math.floor(name.length / 3)) + 1;
  for (const candidate of candidates) {
    const d = distance(name, candidate);
    if (d < bestDistance) [best, bestDistance] = [candidate, d];
  }
  return best === undefined ? "" : ` Did you mean ${prefix}${best}?`;
};

const symbol = (node: SExpr | undefined, what: string, fallback?: Loc): string =>
  isWord(node) ? node.name : fail(node, `Expected ${what}`, fallback);
const string = (node: SExpr | undefined, what: string, fallback?: Loc): string =>
  node?._tag === "Str" ? node.value : fail(node, `Expected ${what} as a string`, fallback);
const number = (node: SExpr | undefined, what: string, fallback?: Loc): number =>
  node?._tag === "Num" ? node.value : fail(node, `Expected ${what} as a number`, fallback);
const items = (node: SExpr | undefined, what: string, fallback?: Loc): readonly SExpr[] =>
  node?._tag === "Vector" ? node.items : fail(node, `Expected ${what} as a [vector]`, fallback);
const kebab = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const name = (node: SExpr | undefined, what: string, fallback?: Loc): string => {
  const value = symbol(node, what, fallback);
  return kebab.test(value) ? value : fail(node, `${value} must be lowercase kebab-case`);
};

interface Options {
  readonly positional: SExpr[];
  readonly flags: Set<string>;
  readonly values: Map<string, SExpr>;
}

/** Split `positional... :flag :option value` arguments, rejecting options a form does not take. */
const options = (args: readonly SExpr[], flags: ReadonlySet<string>, valued: ReadonlySet<string>): Options => {
  const result: Options = { positional: [], flags: new Set(), values: new Map() };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const key = keywordOf(arg);
    if (key === undefined) {
      result.positional.push(arg);
      continue;
    }
    if (flags.has(key)) result.flags.add(key);
    else if (valued.has(key)) {
      if (i + 1 >= args.length) fail(arg, `:${key} needs a value`);
      result.values.set(key, args[++i]!);
    } else fail(arg, `Unknown option :${key}.${suggest(key, [...flags, ...valued], ":")}`);
  }
  return result;
};

const scalarNames: ReadonlySet<string> = new Set(["string", "boolean", "date", "datetime", "integer", "decimal", "address"]);
const placementEntities: ReadonlySet<Entity> = new Set(["placement", "employee", "employer", "client", "job"]);
const extendable: ReadonlySet<string> = placementEntities;

const builtin = (entity: Entity, attribute: string, type: AttributeType, label: string): Attribute => ({
  entity, name: attribute, path: `${entity}.${attribute}`, type, label, builtin: true,
  searchable: false, sensitive: false, scope: false,
});

/** A small slice of the platform catalog: the built-in facts this example reads. */
export const builtinAttributes: readonly Attribute[] = [
  builtin("employee", "first-name", { kind: "string" }, "First name"),
  builtin("employee", "last-name", { kind: "string" }, "Last name"),
  builtin("employee", "email", { kind: "string" }, "Email"),
  builtin("employer", "name", { kind: "string" }, "Employer name"),
  builtin("client", "name", { kind: "string" }, "Client name"),
  builtin("job", "name", { kind: "string" }, "Job name"),
  builtin("placement", "start-date", { kind: "date" }, "Start date"),
  builtin("task", "status", {
    kind: "enum",
    options: [
      { value: "requires-action", label: "Requires action" },
      { value: "completed", label: "Completed" },
      { value: "expired", label: "Expired" },
    ],
  }, "Task status"),
  builtin("task", "due-at", { kind: "date" }, "Due date"),
];

const permissions: ReadonlySet<string> = new Set([
  "placement/read", "placement/edit", "employee/read", "employee/edit", "task/read", "task/edit",
  "task/assign", "form/read", "form/edit", "policy/read", "policy/edit",
]);

const typeName = (type: AttributeType): string => type.kind === "enum" ? "choice" : type.kind;

interface Scope {
  readonly allows: (attribute: Attribute) => string | undefined;
  readonly answers?: ReadonlyMap<string, AttributeType>;
}

const placementScope = (who: string): Scope => ({
  allows: (attribute) => placementEntities.has(attribute.entity)
    ? undefined
    : `${who} read placement, employee, employer, client, and job facts; ${attribute.path} is a ${attribute.entity} fact`,
});
const taskScope: Scope = {
  allows: (attribute) => attribute.entity === "task" || attribute.entity === "employee"
    ? undefined
    : `A task trigger loads task and employee facts; ${attribute.path} is not available`,
};
const accessScope: Scope = {
  allows: (attribute) => attribute.scope
    ? undefined
    : `Access rules may read only :scope attributes; ${attribute.path} is not marked :scope`,
};
const anyScope: Scope = { allows: () => undefined };

interface Context {
  account?: Account;
  readonly attributes: Map<string, Attribute>;
  readonly rules: Map<string, Rule>;
  readonly ruleReads: Map<string, readonly string[]>;
  readonly constants: Map<string, number>;
  readonly declared: Map<string, { readonly verb: string; readonly loc: Loc }>;
  readonly failed: Set<string>;
  readonly forms: Map<string, Form>;
  readonly params: Map<string, Param>;
  readonly diagnostics: Diagnostic[];
}

const declaredAs = (context: Context, node: SExpr, verb: string, label = verb): string => {
  const value = symbol(node, `a ${label} name`);
  const found = context.declared.get(value);
  if (found?.verb === verb) return value;
  const candidates = [...context.declared].filter(([, item]) => item.verb === verb).map(([key]) => key);
  return fail(node, found
    ? `${value} is a ${found.verb}, not a ${label}`
    : `Unknown ${label} ${value}.${suggest(value, candidates)}`);
};

const attributeAt = (context: Context, node: SExpr, scope: Scope): Attribute => {
  if (!isWord(node) || !node.name.includes(".")) return fail(node, `Expected an attribute path such as placement.weekly-hours, got ${show(node)}`);
  const attribute = context.attributes.get(node.name);
  if (!attribute) {
    const entity = node.name.slice(0, node.name.indexOf("."));
    const known = [...context.attributes.keys()];
    return fail(node, known.some((path) => path.startsWith(`${entity}.`))
      ? `Unknown attribute ${node.name}.${suggest(node.name, known)}`
      : `Unknown entity ${entity}.${suggest(entity, [...extendable, "task"])}`);
  }
  const problem = scope.allows(attribute);
  return problem ? fail(node, problem) : attribute;
};

const literal = (node: SExpr, attribute: Attribute): Value => {
  const { type } = attribute;
  if (type.kind === "enum") {
    const value = keywordOf(node);
    if (value === undefined) return fail(node, `${attribute.path} is a choice; use one of ${type.options.map((o) => `:${o.value}`).join(" ")}`);
    const values = type.options.map((option) => option.value);
    return values.includes(value)
      ? value
      : fail(node, `:${value} is not an option of ${attribute.path}.${suggest(value, values, ":")}`);
  }
  if (type.kind === "boolean") return node._tag === "Bool" ? node.value : fail(node, `${attribute.path} is a boolean; use true or false`);
  if (type.kind === "integer" || type.kind === "decimal") {
    if (node._tag !== "Num") return fail(node, `${attribute.path} is ${type.kind === "integer" ? "an integer" : "a decimal"}; use a number`);
    return type.kind === "integer" && !Number.isInteger(node.value) ? fail(node, `${attribute.path} is an integer`) : node.value;
  }
  if (type.kind === "date" || type.kind === "datetime") {
    return node._tag === "Str" && /^\d{4}-\d{2}-\d{2}/.test(node.value)
      ? node.value : fail(node, `${attribute.path} is a ${type.kind}; use an ISO date string`);
  }
  if (type.kind === "string") return node._tag === "Str" ? node.value : fail(node, `${attribute.path} is a string`);
  return fail(node, `${attribute.path} is an address and cannot be compared`);
};

const comparisons: ReadonlySet<string> = new Set(["=", "not=", ">", ">=", "<", "<="]);

/** Attribute paths a rule reads, following named rules. */
const ruleReads = (context: Context, rule: Rule): string[] => {
  switch (rule.op) {
    case "and": case "or": return [...new Set(rule.args.flatMap((arg) => ruleReads(context, arg)))];
    case "not": return ruleReads(context, rule.arg);
    case "rule": return [...(context.ruleReads.get(rule.name) ?? [])];
    case "answer": return [];
    default: return [rule.path];
  }
};

const elaborateRule = (context: Context, node: SExpr, scope: Scope): Rule => {
  if (isWord(node)) {
    if (isPath(node)) {
      const attribute = attributeAt(context, node, scope);
      return attribute.type.kind === "boolean"
        ? { op: "is-true", path: attribute.path }
        : fail(node, `${attribute.path} is a ${typeName(attribute.type)}, not a boolean; compare it with a value`);
    }
    const answer = scope.answers?.get(node.name);
    if (answer) {
      return answer.kind === "boolean" ? { op: "answer", name: node.name } : fail(node, `${node.name} is not a yes/no answer`);
    }
    if (context.rules.has(node.name)) {
      for (const path of context.ruleReads.get(node.name) ?? []) {
        const problem = scope.allows(context.attributes.get(path)!);
        if (problem) fail(node, `${problem} (through rule ${node.name})`);
      }
      return { op: "rule", name: node.name };
    }
    const declared = context.declared.get(node.name);
    if (context.failed.has(node.name)) throw new Cascade(node.name);
    return fail(node, declared?.verb === "rule"
      ? `Rule ${node.name} is used before it is defined`
      : `Unknown rule ${node.name}.${suggest(node.name, [...context.rules.keys(), ...(scope.answers?.keys() ?? [])])}`);
  }
  if (node._tag !== "List" || !isSym(node.items[0])) return fail(node, `Expected a rule, got ${show(node)}`);
  const op = node.items[0].name;
  const args = node.items.slice(1);
  if (op === "and" || op === "or") {
    if (args.length === 0) fail(node, `(${op}) needs at least one rule`);
    return { op, args: args.map((arg) => elaborateRule(context, arg, scope)) };
  }
  if (op === "not") {
    if (args.length !== 1) fail(node, "(not rule) takes one rule");
    return { op, arg: elaborateRule(context, args[0]!, scope) };
  }
  if (op === "missing?") {
    if (args.length !== 1) fail(node, "(missing? path) takes one attribute");
    return { op: "missing", path: attributeAt(context, args[0]!, scope).path };
  }
  if (op === "in") {
    if (args.length !== 2) fail(node, "(in path [values]) takes an attribute and a vector");
    const attribute = attributeAt(context, args[0]!, scope);
    return { op, path: attribute.path, values: items(args[1], "values").map((value) => literal(value, attribute)) };
  }
  if (comparisons.has(op)) {
    if (args.length !== 2) fail(node, `(${op} path value) takes an attribute and a value`);
    const attribute = attributeAt(context, args[0]!, scope);
    const ordered = op !== "=" && op !== "not=";
    if (ordered && !["integer", "decimal", "date", "datetime"].includes(attribute.type.kind)) {
      fail(args[0], `${attribute.path} is a ${typeName(attribute.type)}; ${op} needs a number or date`);
    }
    return { op: "compare", cmp: op as Comparison, path: attribute.path, value: literal(args[1]!, attribute) };
  }
  return fail(node.items[0], `Unknown rule operator ${op}.${suggest(op, ["and", "or", "not", "in", "missing?", ...comparisons])}`);
};

const elaborateAttributes = (context: Context, node: Extract<SExpr, { _tag: "List" }>): void => {
  const entity = symbol(node.items[1], "an entity", node.loc);
  if (!extendable.has(entity)) fail(node.items[1], `Cannot extend ${entity}; extend one of ${[...extendable].join(", ")}`);
  for (const item of node.items.slice(2)) {
    if (item._tag !== "List") fail(item, "Expected (name type \"Label\" options...)");
    const list = item as Extract<SExpr, { _tag: "List" }>;
    const attribute = name(list.items[0], "an attribute name", list.loc);
    const path = `${entity}.${attribute}`;
    const existing = context.attributes.get(path);
    if (existing) fail(list.items[0], existing.builtin ? `${path} is a built-in attribute` : `${path} is already declared`);
    const typeNode = list.items[1];
    let type: AttributeType;
    if (headOf(typeNode) === "one-of") {
      const choices = (typeNode as Extract<SExpr, { _tag: "List" }>).items.slice(1);
      if (choices.length === 0 || choices.length % 2 !== 0) fail(typeNode, "(one-of :value \"Label\" ...) pairs each option with a label");
      const optionList: Array<{ value: string; label: string }> = [];
      for (let i = 0; i < choices.length; i += 2) {
        const key = choices[i];
        const value = keywordOf(key) ?? fail(key, "Choice options are keywords such as :warehouse");
        if (optionList.some((option) => option.value === value)) fail(key, `Duplicate option :${value}`);
        const label = string(choices[i + 1], `the label for :${value}`).trim();
        if (!label) fail(choices[i + 1], "Option labels must not be empty");
        optionList.push({ value, label });
      }
      type = { kind: "enum", options: optionList };
    } else {
      const scalar = symbol(typeNode, "a type", list.loc);
      if (!scalarNames.has(scalar)) fail(typeNode, `Unknown type ${scalar}.${suggest(scalar, [...scalarNames, "one-of"])}`);
      type = { kind: scalar as Scalar };
    }
    const label = string(list.items[2], `a label for ${path}`, list.loc).trim();
    if (!label) fail(list.items[2], "Labels must not be empty");
    const opts = options(list.items.slice(3), new Set(["searchable", "sensitive", "scope"]), new Set(["pattern", "deprecated"]));
    if (opts.positional.length) fail(opts.positional[0], `Unexpected ${show(opts.positional[0]!)}`);
    const flagged = (flag: string) => opts.flags.has(flag);
    if (flagged("sensitive") && (flagged("searchable") || flagged("scope"))) {
      fail(list, `${path} is :sensitive, so it cannot be :searchable or :scope`);
    }
    if (type.kind === "address" && opts.flags.size > 0) fail(list, "Address attributes cannot be :searchable, :sensitive, or :scope");
    const pattern = opts.values.get("pattern");
    if (pattern) {
      if (type.kind !== "string") fail(pattern, ":pattern applies only to string attributes");
      try {
        new RegExp(string(pattern, "a pattern"));
      } catch {
        fail(pattern, "Invalid regular expression");
      }
    }
    const deprecated = opts.values.get("deprecated");
    context.attributes.set(path, {
      entity: entity as Entity, name: attribute, path, type, label, builtin: false,
      searchable: flagged("searchable"), sensitive: flagged("sensitive"), scope: flagged("scope"),
      ...(pattern ? { pattern: string(pattern, "a pattern") } : {}),
      ...(deprecated ? { deprecated: string(deprecated, "a deprecation reason") } : {}),
      loc: list.items[0]!.loc,
    });
  }
};

const elaborateHeader = (context: Context, node: Extract<SExpr, { _tag: "List" }>): Account => {
  const accountName = name(node.items[1], "an account name", node.loc);
  const title = string(node.items[2], "an account title", node.loc);
  const opts = options(node.items.slice(3), new Set(), new Set(["languages", "sender", "support", "dedupe"]));
  if (opts.positional.length) fail(opts.positional[0], `Unexpected ${show(opts.positional[0]!)}`);
  const languageNodes = opts.values.has("languages") ? items(opts.values.get("languages"), "languages") : [];
  const languages = languageNodes.map((language) => keywordOf(language) ?? fail(language, "Languages are keywords such as :en"));
  return {
    name: accountName, title, languages: languages.length ? languages : ["en"],
    ...(opts.values.has("sender") ? { sender: string(opts.values.get("sender"), "a sender email") } : {}),
    ...(opts.values.has("support") ? { support: string(opts.values.get("support"), "a support email") } : {}),
    dedupe: opts.values.has("dedupe")
      ? items(opts.values.get("dedupe"), "dedupe paths").map((path) => attributeAt(context, path, placementScope("Deduplication criteria")).path)
      : [],
  };
};

const formulaFns: ReadonlySet<string> = new Set(["+", "-", "*", "/", "round"]);

/** Build-time arithmetic folds to a number; runtime formulas keep attribute and answer references. */
const elaborateFormula = (context: Context, node: SExpr, scope: Scope): Formula => {
  if (node._tag === "Num") return { op: "number", value: node.value };
  if (isPath(node)) {
    const attribute = attributeAt(context, node, scope);
    return attribute.type.kind === "integer" || attribute.type.kind === "decimal"
      ? { op: "path", path: attribute.path } : fail(node, `${attribute.path} is not a number`);
  }
  if (isWord(node)) {
    const constant = context.constants.get(node.name);
    if (constant !== undefined) return { op: "number", value: constant };
    const answer = scope.answers?.get(node.name);
    if (answer?.kind === "integer" || answer?.kind === "decimal") return { op: "answer", name: node.name };
    return fail(node, `Unknown number ${node.name}.${suggest(node.name, context.constants.keys())}`);
  }
  const fn = headOf(node);
  if (!fn || !formulaFns.has(fn)) return fail(node, `Formulas use numbers, attributes, ${[...formulaFns].join(" ")}`);
  const args = (node as Extract<SExpr, { _tag: "List" }>).items.slice(1).map((arg) => elaborateFormula(context, arg, scope));
  if (fn === "round" && args.length !== 2) fail(node, "(round value places) takes two arguments");
  if (args.length < 1) fail(node, `(${fn}) needs arguments`);
  return { op: "call", fn: fn as "round", args };
};

const foldFormula = (formula: Formula): number | undefined => {
  if (formula.op === "number") return formula.value;
  if (formula.op !== "call") return undefined;
  const values = formula.args.map(foldFormula);
  if (values.some((value) => value === undefined)) return undefined;
  const [first, ...rest] = values as number[];
  switch (formula.fn) {
    case "+": return rest.reduce((a, b) => a + b, first!);
    case "-": return rest.length ? rest.reduce((a, b) => a - b, first!) : -first!;
    case "*": return rest.reduce((a, b) => a * b, first!);
    case "/": return rest.reduce((a, b) => a / b, first!);
    case "round": return Number(first!.toFixed(rest[0]));
  }
};

const formulaReads = (formula: Formula): string[] =>
  formula.op === "path" ? [formula.path] : formula.op === "call" ? formula.args.flatMap(formulaReads) : [];

const fieldTypes: Readonly<Record<string, { readonly accepts: (type: AttributeType) => boolean; readonly answer?: AttributeType; readonly expects: string }>> = {
  checkbox: { accepts: (type) => type.kind === "boolean", answer: { kind: "boolean" }, expects: "boolean" },
  text: { accepts: (type) => type.kind === "string", answer: { kind: "string" }, expects: "string" },
  number: { accepts: (type) => type.kind === "integer" || type.kind === "decimal", answer: { kind: "decimal" }, expects: "integer or decimal" },
  date: { accepts: (type) => type.kind === "date", answer: { kind: "date" }, expects: "date" },
  address: { accepts: (type) => type.kind === "address", answer: { kind: "address" }, expects: "address" },
  dropdown: { accepts: (type) => type.kind === "enum", expects: "choice" },
};

const elaborateForm = (context: Context, node: Extract<SExpr, { _tag: "List" }>): Form => {
  const account = context.account!;
  const formName = name(node.items[1], "a form name", node.loc);
  const hasTitle = node.items[2]?._tag === "Str";
  const rest = node.items.slice(hasTitle ? 3 : 2);
  const opts = options(rest, new Set(), new Set(["key", "due-in", "from"]));
  const keyNode = opts.values.get("key");
  const key = keyNode ? string(keyNode, "a form key") : `${account.name}.${formName}`;
  const fromNode = opts.values.get("from");
  if (fromNode) {
    if (!keyNode) fail(node, "A form :from another package needs its :key");
    if (key.startsWith(`${account.name}.`)) fail(keyNode, `${key} is in this account's namespace; a :from form belongs to another package`);
    if (hasTitle || opts.positional.length || opts.values.has("due-in")) fail(node, "A :from form is a reference; it has no title, pages, or :due-in");
    return { name: formName, key, from: string(fromNode, "a package name"), pages: [], reads: [], writes: [], loc: node.loc };
  }
  if (!hasTitle) fail(node, `(form ${formName} "Title" pages...) needs a title`, node.loc);
  if (keyNode && !key.startsWith(`${account.name}.`)) fail(keyNode, `Form keys must start with ${account.name}.`);
  const dueNode = opts.values.get("due-in");
  const dueIn = dueNode ? number(dueNode, "days") : undefined;
  if (dueIn !== undefined && (!Number.isInteger(dueIn) || dueIn <= 0)) fail(dueNode, ":due-in is a positive number of days");

  const answers = new Map<string, AttributeType>();
  const scope: Scope = { ...placementScope("Forms"), answers };
  const reads: string[] = [];
  const writes: string[] = [];
  const read = (paths: readonly string[]) => reads.push(...paths.filter((path) => !reads.includes(path)));
  const translationKeys = new Set(account.languages.slice(1));
  const defineAnswer = (node: SExpr, type: AttributeType): FieldTarget => {
    const answer = name(node, "an answer name");
    if (answers.has(answer)) fail(node, `${answer} is already an answer in ${formName}`);
    answers.set(answer, type);
    return { answer };
  };
  const targetRef = (node: SExpr): FieldTarget => {
    if (isPath(node)) {
      const path = attributeAt(context, node, scope).path;
      read([path]);
      return { path };
    }
    const answer = symbol(node, "an attribute or answer");
    return answers.has(answer) ? { answer } : fail(node, `Unknown answer ${answer}.${suggest(answer, answers.keys())}`);
  };

  const pages: Page[] = opts.positional.map((pageNode): Page => {
    if (headOf(pageNode) !== "page") return fail(pageNode, `Expected (page "Title" :employee fields...)`);
    const pageItems = (pageNode as Extract<SExpr, { _tag: "List" }>).items;
    const title = string(pageItems[1], "a page title", pageNode.loc);
    const assigneeNode = pageItems[2];
    const assignee = keywordOf(assigneeNode) ?? "";
    if (assignee !== "employee" && assignee !== "employer") fail(assigneeNode ?? pageNode, "Pages are assigned to :employee or :employer");
    const fields = pageItems.slice(3).map((fieldNode): Field => {
      const kind = headOf(fieldNode);
      const args = fieldNode._tag === "List" ? fieldNode.items.slice(1) : [];
      if (kind === "signature") {
        return { kind, target: defineAnswer(args[0]!, { kind: "string" }), label: "Signature", required: true, translations: {} };
      }
      if (kind === "content") return { kind, text: string(args[0], "content text", fieldNode.loc), required: false, translations: {} };
      if (kind === "review") {
        return { kind, label: "Review", rows: items(args[0], "review rows", fieldNode.loc).map(targetRef), required: false, translations: {} };
      }
      if (kind === "formula") {
        const label = string(args[1], "a formula label", fieldNode.loc);
        const formula = elaborateFormula(context, args[2] ?? fail(fieldNode, "(formula name \"Label\" expression)"), scope);
        read(formulaReads(formula));
        return { kind, target: defineAnswer(args[0]!, { kind: "decimal" }), label, formula, required: false, translations: {} };
      }
      const fieldType = kind ? fieldTypes[kind] : undefined;
      if (!fieldType) {
        return fail(fieldNode, `Unknown field ${kind ?? show(fieldNode)}.${suggest(kind ?? "", [...Object.keys(fieldTypes), "signature", "formula", "review", "content"])}`);
      }
      const targetNode = args[0] ?? fail(fieldNode, `(${kind} target "Label") needs a target`);
      const label = string(args[1], "a field label", fieldNode.loc);
      const fieldOpts = options(args.slice(2), new Set(["required"]), new Set(["show-if", ...translationKeys]));
      if (fieldOpts.positional.length) fail(fieldOpts.positional[0], `Unexpected ${show(fieldOpts.positional[0]!)}`);
      let target: FieldTarget;
      if (isPath(targetNode)) {
        const attribute = attributeAt(context, targetNode, scope);
        if (!fieldType.accepts(attribute.type)) {
          fail(targetNode, `A ${kind} field writes ${fieldType.expects} values; ${attribute.path} is a ${typeName(attribute.type)}`);
        }
        if (attribute.deprecated) fail(targetNode, `${attribute.path} is deprecated (${attribute.deprecated}); forms cannot write it`);
        if (attribute.builtin) fail(targetNode, `${attribute.path} is a built-in attribute; forms write custom attributes`);
        if (writes.includes(attribute.path)) fail(targetNode, `${formName} already writes ${attribute.path}`);
        writes.push(attribute.path);
        target = { path: attribute.path };
      } else {
        if (!fieldType.answer) fail(targetNode, `A ${kind} field must bind a choice attribute`);
        target = defineAnswer(targetNode, fieldType.answer!);
      }
      const showIfNode = fieldOpts.values.get("show-if");
      const showIf = showIfNode ? elaborateRule(context, showIfNode, scope) : undefined;
      if (showIf) read(ruleReads(context, showIf));
      const translations = Object.fromEntries([...translationKeys].filter((language) => fieldOpts.values.has(language))
        .map((language) => [language, string(fieldOpts.values.get(language), `the ${language} label`)]));
      return { kind: kind!, target, label, required: fieldOpts.flags.has("required"), ...(showIf ? { showIf } : {}), translations };
    });
    return { title, assignee: assignee as Page["assignee"], fields };
  });
  if (pages.length === 0) fail(node, `${formName} needs at least one page`);
  return {
    name: formName, key, title: string(node.items[2], "a title"), ...(dueIn !== undefined ? { dueIn } : {}),
    pages, reads: reads.filter((path) => !writes.includes(path)), writes, loc: node.loc,
  };
};

const elaboratePolicy = (context: Context, node: Extract<SExpr, { _tag: "List" }>): Policy => {
  const policyName = name(node.items[1], "a policy name", node.loc);
  const title = string(node.items[2], "a policy title", node.loc);
  const opts = options(node.items.slice(3), new Set(), new Set(["when", "require"]));
  if (opts.positional.length) fail(opts.positional[0], `Unexpected ${show(opts.positional[0]!)}`);
  const scope = placementScope("Policies");
  const whenNode = opts.values.get("when");
  const seen = new Set<string>();
  const require = items(opts.values.get("require"), ":require forms", node.loc).map((entry) => {
    const formNode = entry._tag === "List" ? entry.items[0] : entry;
    const form = declaredAs(context, formNode!, "form");
    if (seen.has(form)) fail(formNode, `${policyName} already requires ${form}`);
    seen.add(form);
    if (entry._tag !== "List") return { form };
    const entryOpts = options(entry.items.slice(1), new Set(), new Set(["when"]));
    const when = entryOpts.values.get("when");
    return { form, ...(when ? { when: elaborateRule(context, when, scope) } : {}) };
  });
  return {
    name: policyName, key: `${context.account!.name}.${policyName}`, title,
    ...(whenNode ? { when: elaborateRule(context, whenNode, scope) } : {}), require, loc: node.loc,
  };
};

const elaborateAutomation = (context: Context, node: Extract<SExpr, { _tag: "List" }>): Automation => {
  const automationName = name(node.items[1], "an automation name", node.loc);
  const title = string(node.items[2], "an automation title", node.loc);
  const opts = options(node.items.slice(3), new Set(), new Set(["on"]));
  const triggerNode = opts.values.get("on") ?? fail(node, `${automationName} needs a trigger, such as :on (task-created form)`);
  const triggerKind = headOf(triggerNode);
  let trigger: Trigger;
  if (triggerKind === "task-created" || triggerKind === "task-completed") {
    trigger = { kind: triggerKind, form: declaredAs(context, (triggerNode as Extract<SExpr, { _tag: "List" }>).items[1] ?? triggerNode, "form") };
  } else if (triggerKind === "placement-created") {
    trigger = { kind: triggerKind };
  } else {
    return fail(triggerNode, `Unknown trigger ${triggerKind ?? show(triggerNode)}.${suggest(triggerKind ?? "", ["task-created", "task-completed", "placement-created"])}`);
  }
  const scope = trigger.kind === "placement-created" ? placementScope("Placement triggers") : taskScope;
  const counts = new Map<string, number>();
  const id = (kind: string) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return count === 1 ? kind : `${kind}-${count}`;
  };
  const steps = (nodes: readonly SExpr[]): Step[] => nodes.map((stepNode): Step => {
    const kind = headOf(stepNode);
    const args = stepNode._tag === "List" ? stepNode.items.slice(1) : [];
    if (kind === "wait") {
      const days = number(args[0], "a number of days", stepNode.loc);
      const waitOpts = options(args.slice(1), new Set(["days"]), new Set(["after"]));
      if (!waitOpts.flags.has("days")) fail(stepNode, "(wait n :days) names its unit");
      const afterNode = waitOpts.values.get("after");
      if (!afterNode) return { kind, id: id(kind), days };
      const after = attributeAt(context, afterNode, scope);
      if (after.type.kind !== "date" && after.type.kind !== "datetime") fail(afterNode, `${after.path} is not a date`);
      if (after.path === "task.due-at" && trigger.kind !== "placement-created") {
        const form = context.forms.get(trigger.form);
        if (form && !form.from && form.dueIn === undefined) {
          fail(afterNode, `${automationName} waits after task.due-at, but ${form.name} sets no :due-in`);
        }
      }
      return { kind, id: id(kind), days, after: after.path };
    }
    if (kind === "when") {
      const stepId = id(kind);
      return { kind, id: stepId, rule: elaborateRule(context, args[0] ?? fail(stepNode, "(when rule steps...)"), scope), then: steps(args.slice(1)) };
    }
    if (kind === "email") {
      const to = keywordOf(args[0]) ?? "";
      if (to !== "employee" && to !== "employer") fail(args[0] ?? stepNode, "Email :employee or :employer");
      const template = declaredAs(context, args[1] ?? stepNode, "param");
      const param = context.params.get(template);
      if (param && param.type !== "sendgrid-template") fail(args[1], `${template} is a ${param.type}, not a :sendgrid-template`);
      const subject = string(args[2], "an email subject", stepNode.loc);
      const body = string(args[3], "an email body", stepNode.loc);
      for (const match of body.matchAll(/\{\{\s*([a-z_]+)\.([a-z_]+)\s*\}\}/g)) {
        const path = `${match[1]}.${match[2]!.replaceAll("_", "-")}`;
        const attribute = context.attributes.get(path);
        if (!attribute) fail(args[3], `The body renders unknown attribute ${match[1]}.${match[2]}`);
        const problem = scope.allows(attribute!);
        if (problem) fail(args[3], problem);
        if (attribute!.sensitive) {
          context.diagnostics.push({ severity: "warning", message: `The email renders sensitive attribute ${path}`, loc: args[3]!.loc });
        }
      }
      return { kind, id: id(kind), to: to as "employee", template, subject, body };
    }
    if (kind === "assign") return { kind, id: id(kind), form: declaredAs(context, args[0] ?? stepNode, "form") };
    return fail(stepNode, `Unknown step ${kind ?? show(stepNode)}.${suggest(kind ?? "", ["wait", "when", "email", "assign"])}`);
  });
  const body = steps(opts.positional);
  if (body.length === 0) fail(node, `${automationName} has no steps`);
  return { name: automationName, key: `${context.account!.name}.${automationName}`, title, trigger, steps: body, loc: node.loc };
};

const elaborateGroup = (context: Context, node: Extract<SExpr, { _tag: "List" }>): Group => {
  const groupName = name(node.items[1], "a group name", node.loc);
  const title = string(node.items[2], "a group title", node.loc);
  const opts = options(node.items.slice(3), new Set(), new Set(["can", "sees"]));
  const granted = items(opts.values.get("can"), ":can permissions", node.loc).map((permission) => {
    const value = keywordOf(permission) ?? fail(permission, "Permissions are keywords such as :task/read");
    return permissions.has(value) ? value : fail(permission, `Unknown permission :${value}.${suggest(value, permissions, ":")}`);
  });
  const sees = opts.values.get("sees");
  return { name: groupName, title, permissions: granted, ...(sees ? { sees: elaborateRule(context, sees, accessScope) } : {}), loc: node.loc };
};

const settingValue = (node: SExpr): Value => {
  if (node._tag === "Str" || node._tag === "Num" || node._tag === "Bool") return node.value;
  return keywordOf(node) ?? fail(node, "Settings are strings, numbers, booleans, or keywords");
};

const elaborateIntegration = (_context: Context, node: Extract<SExpr, { _tag: "List" }>): Integration => {
  const integrationName = name(node.items[1], "an integration name", node.loc);
  const providerNode = node.items[2];
  const provider = string(providerNode, "a provider@revision", node.loc);
  const at = provider.lastIndexOf("@");
  if (at <= 0) fail(providerNode, "Pin the provider revision, as in \"@scope/provider@1.4.0\"");
  const settings: Record<string, Value> = {};
  let connection: string | undefined;
  const rest = node.items.slice(3);
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]!;
    const setting = keywordOf(key);
    if (setting === undefined || i + 1 >= rest.length) fail(key, "Integration settings are :key value pairs");
    if (setting === "connection") connection = string(rest[i + 1], "a connection reference");
    else settings[setting] = settingValue(rest[i + 1]!);
  }
  return {
    name: integrationName, provider: provider.slice(0, at), revision: provider.slice(at + 1),
    connection: connection ?? fail(node, "An integration names its :connection; credentials stay with the target account"),
    settings, loc: node.loc,
  };
};

const elaborateParam = (_context: Context, node: Extract<SExpr, { _tag: "List" }>): Param => {
  const paramName = name(node.items[1], "a parameter name", node.loc);
  const typeNode = node.items[2];
  const type = keywordOf(typeNode) ?? "";
  if (!["sendgrid-template", "string"].includes(type)) fail(typeNode ?? node, "Parameter types are :sendgrid-template or :string");
  const doc = node.items[3];
  return { name: paramName, type, ...(doc ? { doc: string(doc, "a description") } : {}), loc: node.loc };
};

const elaborateScenario = (context: Context, node: Extract<SExpr, { _tag: "List" }>): Scenario => {
  const title = string(node.items[1], "a scenario title", node.loc);
  const givenNode = node.items[2];
  if (givenNode?._tag !== "Map") return fail(givenNode ?? node, "A scenario starts with its facts: {path value ...}");
  const factScope: Scope = {
    allows: (attribute) => attribute.entity === "task" ? "Scenarios give placement facts; task facts come from the simulation" : undefined,
  };
  const facts = (pairs: readonly (readonly [SExpr, SExpr])[]): Map<string, Value> =>
    new Map(pairs.map(([key, value]) => {
      const attribute = attributeAt(context, key, factScope);
      return [attribute.path, literal(value, attribute)];
    }));
  const given = facts(givenNode.pairs);
  const names = (node: SExpr | undefined, verb: string): string[] =>
    items(node, `${verb} names`).map((item) => declaredAs(context, item, verb));
  const expectation = (args: readonly SExpr[]): Expectation => {
    const opts = options(args, new Set(), new Set(["policies", "forms", "unknown", "tasks", "open", "emails"]));
    if (opts.positional.length) fail(opts.positional[0], `Unexpected ${show(opts.positional[0]!)}`);
    const expect: Record<string, unknown> = {};
    if (opts.values.has("policies")) expect.policies = names(opts.values.get("policies"), "policy");
    for (const key of ["forms", "tasks", "open"]) if (opts.values.has(key)) expect[key] = names(opts.values.get(key), "form");
    const unknown = opts.values.get("unknown");
    if (unknown) {
      if (unknown._tag !== "Map") fail(unknown, ":unknown maps a policy or form to the facts it waits for");
      expect.unknown = Object.fromEntries((unknown as Extract<SExpr, { _tag: "Map" }>).pairs.map(([key, paths]) => {
        const subject = symbol(key, "a policy or form");
        const verb = context.declared.get(subject)?.verb;
        if (verb !== "policy" && verb !== "form") fail(key, `Unknown policy or form ${subject}`);
        return [subject, items(paths, "attribute paths").map((path) => attributeAt(context, path, anyScope).path)];
      }));
    }
    const emails = opts.values.get("emails");
    if (emails) {
      expect.emails = items(emails, "emails").map((email): EmailExpectation => {
        if (email._tag === "Str") return { subject: email.value };
        if (email._tag !== "Map") return fail(email, "An expected email is a subject or {:to :subject :body}");
        return Object.fromEntries(email.pairs.map(([key, value]) => {
          const field = keywordOf(key) ?? "";
          if (!["to", "subject", "body"].includes(field)) fail(key, "Expected email keys are :to, :subject, and :body");
          return [field, field === "to" ? settingValue(value) : string(value, field)];
        }));
      });
    }
    return expect as Expectation;
  };
  const action = (actionNode: SExpr): ScenarioAction => {
    const kind = headOf(actionNode);
    const args = actionNode._tag === "List" ? actionNode.items.slice(1) : [];
    if (kind === "expect") return { kind, expect: expectation(args), loc: actionNode.loc };
    if (kind === "record") {
      const attribute = attributeAt(context, args[0] ?? actionNode, factScope);
      return { kind, path: attribute.path, value: literal(args[1] ?? fail(actionNode, "(record path value)"), attribute), loc: actionNode.loc };
    }
    if (kind === "complete") {
      const form = declaredAs(context, args[0] ?? actionNode, "form");
      const writesNode = args[1];
      if (writesNode && writesNode._tag !== "Map") fail(writesNode, "(complete form {path value ...})");
      const writes = writesNode ? facts((writesNode as Extract<SExpr, { _tag: "Map" }>).pairs) : new Map<string, Value>();
      const declared = context.forms.get(form)?.writes ?? [];
      for (const [path] of writes) if (!declared.includes(path)) fail(writesNode, `${form} does not write ${path}`);
      return { kind, form, writes, loc: actionNode.loc };
    }
    return fail(actionNode, `Unknown scenario step ${kind ?? show(actionNode)}.${suggest(kind ?? "", ["expect", "record", "complete", "day"])}`);
  };
  const days: Array<{ day: number; actions: ScenarioAction[] }> = [{ day: 0, actions: [] }];
  for (const step of node.items.slice(3)) {
    if (headOf(step) === "day") {
      const dayItems = (step as Extract<SExpr, { _tag: "List" }>).items;
      const day = number(dayItems[1], "a day number", step.loc);
      if (!Number.isInteger(day) || day <= days[days.length - 1]!.day) fail(dayItems[1], "Scenario days must be whole numbers that increase");
      days.push({ day, actions: dayItems.slice(2).map(action) });
    } else {
      if (days.length > 1) fail(step, "Steps after a (day n ...) belong inside a day");
      days[0]!.actions.push(action(step));
    }
  }
  return { title, given, days, loc: node.loc };
};

const namedVerbs: ReadonlySet<string> = new Set(["rule", "def", "form", "policy", "param", "automation", "group", "integration"]);
const verbs: ReadonlySet<string> = new Set(["account", "attributes", "scenario", ...namedVerbs]);
const order = ["account", "attributes", "definitions", "form", "param", "policy", "automation", "group", "integration", "scenario"];
const phase = (verb: string) => verb === "rule" || verb === "def" ? "definitions" : verb;

export interface ElaborationResult {
  readonly program?: AccountProgram;
  readonly diagnostics: readonly Diagnostic[];
}

const lineAt = (source: string, offset: number): number => {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source[i] === "\n") line++;
  return line;
};

/** Elaborate one account source. Every problem becomes a located diagnostic; there are no partial programs. */
export const elaborateAccount = (source: string): ElaborationResult => {
  let expressions: readonly SExpr[];
  try {
    const parsed = parse(source);
    if (parsed.errors.length) {
      const error = parsed.errors[0]!;
      return { diagnostics: [{ severity: "error", message: error.message, ...(error.loc ? { loc: error.loc } : {}) }] };
    }
    expressions = toSExprMany(parsed.redTree);
  } catch (error) {
    const loc = (error as { loc?: Loc }).loc;
    return { diagnostics: [{ severity: "error", message: (error as Error).message, ...(loc ? { loc } : {}) }] };
  }

  const context: Context = {
    attributes: new Map(builtinAttributes.map((attribute) => [attribute.path, attribute])),
    rules: new Map(), ruleReads: new Map(), constants: new Map(), declared: new Map(), failed: new Set(),
    forms: new Map(), params: new Map(), diagnostics: [],
  };
  const report = (error: unknown) => {
    if (!(error instanceof AccountError)) throw error;
    if (error instanceof Cascade) return;
    context.diagnostics.push({ severity: "error", message: error.message, ...(error.loc ? { loc: error.loc } : {}) });
  };

  const declarations: Declaration[] = [];
  const lists: Array<Extract<SExpr, { _tag: "List" }>> = [];
  for (const expression of expressions) {
    try {
      const verb = headOf(expression);
      if (!verb || !verbs.has(verb)) {
        fail(expression._tag === "List" ? expression.items[0] ?? expression : expression,
          `Unknown declaration ${verb ?? show(expression)}.${suggest(verb ?? "", verbs)}`);
      }
      const list = expression as Extract<SExpr, { _tag: "List" }>;
      const label = verb === "scenario" ? string(list.items[1], "a scenario title", list.loc)
        : verb === "attributes" ? symbol(list.items[1], "an entity", list.loc)
        : name(list.items[1], `a ${verb} name`, list.loc);
      if (namedVerbs.has(verb!)) {
        const previous = context.declared.get(label);
        if (previous) fail(list.items[1], `${label} is already declared on line ${previous.loc.line}`);
        context.declared.set(label, { verb: verb!, loc: list.loc });
      }
      declarations.push({ verb: verb!, name: label, startLine: list.loc.line, endLine: lineAt(source, list.loc.end - 1) });
      lists.push(list);
    } catch (error) {
      report(error);
    }
  }
  const accounts = lists.filter((list) => headOf(list) === "account");
  if (accounts.length !== 1 || lists[0] !== accounts[0]) {
    context.diagnostics.push({
      severity: "error", message: "An account file starts with exactly one (account name \"Title\" ...)",
      loc: (accounts[1] ?? lists[0])?.loc ?? { line: 1, col: 1, start: 0, end: 0 },
    });
    return { diagnostics: context.diagnostics };
  }

  const policies: Policy[] = [];
  const automations: Automation[] = [];
  const groups: Group[] = [];
  const integrations: Integration[] = [];
  const scenarios: Scenario[] = [];
  for (const current of order) {
    for (const list of lists.filter((item) => phase(headOf(item)!) === current)) {
      try {
        const verb = headOf(list)!;
        if (verb === "account") context.account = elaborateHeader(context, list);
        else if (verb === "attributes") elaborateAttributes(context, list);
        else if (verb === "def") {
          const constant = foldFormula(elaborateFormula(context, list.items[2] ?? fail(list, "(def name expression)"), anyScope));
          if (constant === undefined) fail(list.items[2], "A def is evaluated at build time; use numbers and other defs");
          context.constants.set(symbol(list.items[1], "a name"), constant!);
        } else if (verb === "rule") {
          const ruleName = symbol(list.items[1], "a rule name");
          if (list.items.length !== 3) fail(list, "(rule name expression)");
          const rule = elaborateRule(context, list.items[2]!, anyScope);
          context.rules.set(ruleName, rule);
          context.ruleReads.set(ruleName, ruleReads(context, rule));
        } else if (verb === "form") {
          const form = elaborateForm(context, list);
          context.forms.set(form.name, form);
        } else if (verb === "param") {
          const param = elaborateParam(context, list);
          context.params.set(param.name, param);
        } else if (verb === "policy") policies.push(elaboratePolicy(context, list));
        else if (verb === "automation") automations.push(elaborateAutomation(context, list));
        else if (verb === "group") groups.push(elaborateGroup(context, list));
        else if (verb === "integration") integrations.push(elaborateIntegration(context, list));
        else scenarios.push(elaborateScenario(context, list));
      } catch (error) {
        if (isWord(list.items[1])) context.failed.add(list.items[1].name);
        report(error);
      }
      if (current === "account" && !context.account) return { diagnostics: context.diagnostics };
    }
  }
  context.diagnostics.sort((a, b) => (a.loc?.start ?? 0) - (b.loc?.start ?? 0));
  if (context.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return { diagnostics: context.diagnostics };
  const forms = new Set([...policies.flatMap((policy) => policy.require.map((entry) => entry.form)),
    ...automations.flatMap((automation) => {
      const assigned = (steps: readonly Step[]): string[] => steps.flatMap((step) =>
        step.kind === "assign" ? [step.form] : step.kind === "when" ? assigned(step.then) : []);
      return [...assigned(automation.steps), ...("form" in automation.trigger ? [automation.trigger.form] : [])];
    })]);
  for (const form of context.forms.values()) {
    if (!forms.has(form.name)) {
      context.diagnostics.push({ severity: "warning", message: `No policy or automation uses ${form.name}`, loc: form.loc });
    }
  }
  context.diagnostics.sort((a, b) => (a.loc?.start ?? 0) - (b.loc?.start ?? 0));
  return {
    program: {
      account: context.account!, attributes: context.attributes, rules: context.rules, constants: context.constants,
      forms: context.forms, policies, params: context.params, automations, groups, integrations, scenarios, declarations,
    },
    diagnostics: context.diagnostics,
  };
};

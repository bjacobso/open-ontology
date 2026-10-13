import type { AccountProgram, Attribute, FieldTarget, Formula, Rule, Step, Value } from "./model.js";

/** A directional, JSON-safe resource; the shapes echo platform field names but are not production formats. */
export interface Resource {
  readonly kind: string;
  readonly key: string;
  readonly spec: Readonly<Record<string, unknown>>;
}

const snake = (name: string) => name.replaceAll("-", "_");

/** Built-ins keep their platform field; custom attributes live under custom_attributes. */
export const factPath = (program: AccountProgram, path: string): string => {
  const attribute = program.attributes.get(path);
  if (path.startsWith("form.")) return snake(path);
  if (!attribute) return snake(path);
  return attribute.builtin ? `${attribute.entity}.${snake(attribute.name)}` : `${attribute.entity}.custom_attributes.${snake(attribute.name)}`;
};

/** Choice values follow the platform's snake_case option names; other literals pass through. */
const value = (program: AccountProgram, path: string, input: Value): Value =>
  program.attributes.get(path)?.type.kind === "enum" ? snake(String(input)) : input;

const operators = { "=": "eq", "not=": "neq", ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" } as const;

/** Named rules are inlined: the target platform stores each rule where it is used. */
export const lowerRule = (program: AccountProgram, rule: Rule): unknown => {
  switch (rule.op) {
    case "and": return { all: rule.args.map((arg) => lowerRule(program, arg)) };
    case "or": return { any: rule.args.map((arg) => lowerRule(program, arg)) };
    case "not": return { not: lowerRule(program, rule.arg) };
    case "rule": return lowerRule(program, program.rules.get(rule.name)!);
    case "answer": return { fact: `form.${snake(rule.name)}`, op: "eq", value: true };
    case "missing": return { fact: factPath(program, rule.path), op: "not_exists" };
    case "is-true": return { fact: factPath(program, rule.path), op: "eq", value: true };
    case "in": return { fact: factPath(program, rule.path), op: "in", value: rule.values.map((item) => value(program, rule.path, item)) };
    case "compare": return { fact: factPath(program, rule.path), op: operators[rule.cmp], value: value(program, rule.path, rule.value) };
  }
};

const formula = (program: AccountProgram, input: Formula): string => {
  switch (input.op) {
    case "number": return String(input.value);
    case "path": return `[${factPath(program, input.path)}]`;
    case "answer": return `[form.${snake(input.name)}]`;
    case "call": return input.fn === "round"
      ? `ROUND(${formula(program, input.args[0]!)}, ${formula(program, input.args[1]!)})`
      : input.args.map((arg) => formula(program, arg)).join(` ${input.fn} `);
  }
};

const target = (program: AccountProgram, input: FieldTarget) =>
  "path" in input ? factPath(program, input.path) : `form.${snake(input.answer)}`;

const scalar = (attribute: Attribute) => attribute.type.kind === "enum" ? "enum" : attribute.type.kind;

const property = (program: AccountProgram, attribute: Attribute): Resource => ({
  kind: "property",
  key: factPath(program, attribute.path),
  spec: {
    entity_type: attribute.entity,
    name: snake(attribute.name),
    path: `custom_attributes.${snake(attribute.name)}`,
    label: attribute.label,
    scalar_type: scalar(attribute),
    ...(attribute.type.kind === "enum" ? {
      enum_options: attribute.type.options.map((option) => snake(option.value)),
      option_labels: Object.fromEntries(attribute.type.options.map((option) => [snake(option.value), option.label])),
    } : {}),
    is_searchable: attribute.searchable,
    is_sensitive_info: attribute.sensitive,
    is_permission_scope: attribute.scope,
    ...(attribute.pattern ? { value_validation_regex: attribute.pattern } : {}),
    ...(attribute.deprecated ? { deprecated: { reason: attribute.deprecated } } : {}),
  },
});

const steps = (program: AccountProgram, input: readonly Step[], nodes: Record<string, unknown>, edges: unknown[], from?: { id: string; branch?: string }) => {
  let previous = from;
  for (const step of input) {
    if (previous) edges.push({ from: previous.id, to: snake(step.id), ...(previous.branch ? { branch: previous.branch } : {}) });
    const id = snake(step.id);
    if (step.kind === "wait") nodes[id] = { type: "wait", days: step.days, ...(step.after ? { after: factPath(program, step.after) } : {}) };
    else if (step.kind === "when") {
      nodes[id] = { type: "condition", rule: lowerRule(program, step.rule) };
      steps(program, step.then, nodes, edges, { id, branch: "yes" });
    } else if (step.kind === "email") {
      nodes[id] = {
        type: "send_email", to: step.to, template: { kind: "parameter", key: snake(step.template) },
        subject: step.subject, body: step.body,
      };
    } else nodes[id] = { type: "create_task", form: program.forms.get(step.form)!.key };
    previous = { id };
  }
};

/** Lower each declaration to the resources it contributes, in source order. */
export const lowerDeclarations = (program: AccountProgram): ReadonlyArray<{ readonly index: number; readonly resources: readonly Resource[] }> => {
  const { account } = program;
  const custom = [...program.attributes.values()].filter((attribute) => !attribute.builtin);
  const forms = [...program.forms.values()];
  let policy = 0;
  let automation = 0;
  let group = 0;
  let integration = 0;
  let scenario = 0;
  return program.declarations.map((declaration, index) => {
    const resources = ((): Resource[] => {
      switch (declaration.verb) {
        case "account": return [{
          kind: "account", key: account.name,
          spec: {
            name: account.title, default_language: account.languages[0], supported_languages: account.languages,
            ...(account.sender ? { sender_email: account.sender } : {}),
            ...(account.support ? { candidate_support_email: account.support } : {}),
            deduplication_match_criteria: account.dedupe.map((path) => factPath(program, path)),
          },
        }];
        case "attributes": return custom
          .filter((attribute) => declaration.startLine <= attribute.loc!.line && attribute.loc!.line <= declaration.endLine)
          .map((attribute) => property(program, attribute));
        case "rule": case "def": return [];
        case "form": {
          const form = program.forms.get(declaration.name)!;
          if (form.from) return [{ kind: "form-reference", key: form.key, spec: { from: form.from } }];
          return [{
            kind: "form", key: form.key,
            spec: {
              name: form.title, languages: account.languages,
              ...(form.dueIn ? { task_due_in_days: form.dueIn } : {}),
              pages: form.pages.map((page) => ({
                name: page.title, assignee: page.assignee,
                fields: page.fields.map((field) => ({
                  type: field.kind,
                  ...(field.target ? { path: target(program, field.target) } : {}),
                  ...(field.label ? { label: field.label } : {}),
                  ...(field.required ? { required: true } : {}),
                  ...(field.showIf ? { rule: { show: lowerRule(program, field.showIf) } } : {}),
                  ...(Object.keys(field.translations).length ? { i18n: Object.fromEntries(Object.entries(field.translations).map(([language, label]) => [language, { label }])) } : {}),
                  ...(field.formula ? { value: `=${formula(program, field.formula)}` } : {}),
                  ...(field.rows ? { rows: field.rows.map((row) => target(program, row)) } : {}),
                  ...(field.text ? { content: field.text } : {}),
                })),
              })),
              reads: form.reads.map((path) => factPath(program, path)),
              writes: form.writes.map((path) => factPath(program, path)),
            },
          }];
        }
        case "param": {
          const param = program.params.get(declaration.name)!;
          return [{ kind: "parameter", key: snake(param.name), spec: { type: snake(param.type), ...(param.doc ? { doc: param.doc } : {}) } }];
        }
        case "policy": {
          const item = program.policies[policy++]!;
          return [{
            kind: "policy", key: item.key,
            spec: {
              name: item.title, status: "enabled",
              rules: item.when ? lowerRule(program, item.when) : { all: [] },
              forms: item.require.map((entry) => ({
                form: program.forms.get(entry.form)!.key, ...(entry.when ? { rule: lowerRule(program, entry.when) } : {}),
              })),
            },
          }];
        }
        case "automation": {
          const item = program.automations[automation++]!;
          const nodes: Record<string, unknown> = {};
          const edges: unknown[] = [];
          steps(program, item.steps, nodes, edges);
          const trigger = item.trigger.kind === "placement-created"
            ? { entity: "placement", events: ["created"] }
            : { entity: "task", events: [item.trigger.kind.slice(5)], form: program.forms.get(item.trigger.form)!.key };
          return [{ kind: "automation", key: item.key, spec: { name: item.title, trigger, nodes, edges } }];
        }
        case "group": {
          const item = program.groups[group++]!;
          return [{
            kind: "user-group", key: `${account.name}.${item.name}`,
            spec: { name: item.title, permissions: item.permissions, access_rules: item.sees ? lowerRule(program, item.sees) : { all: [] } },
          }];
        }
        case "integration": {
          const item = program.integrations[integration++]!;
          return [{
            kind: "integration", key: `${account.name}.${item.name}`,
            spec: { provider: item.provider, revision: item.revision, connection: { kind: "connection", key: item.connection }, settings: item.settings },
          }];
        }
        default: {
          const item = program.scenarios[scenario++]!;
          const facts = (map: ReadonlyMap<string, Value>) => Object.fromEntries([...map].map(([path, input]) => [factPath(program, path), value(program, path, input)]));
          return [{
            kind: "scenario", key: `${account.name}.scenario-${scenario}`,
            spec: {
              name: item.title, given: facts(item.given),
              days: item.days.filter((entry) => entry.actions.length).map((entry) => ({
                day: entry.day,
                actions: entry.actions.map((action) => action.kind === "record"
                  ? { record: { [factPath(program, action.path)]: value(program, action.path, action.value) } }
                  : action.kind === "complete"
                    ? { complete: forms.find((form) => form.name === action.form)!.key, ...(action.writes.size ? { writes: facts(action.writes) } : {}) }
                    : { expect: action.expect }),
              })),
            },
          }];
        }
      }
    })();
    return { index, resources };
  });
};

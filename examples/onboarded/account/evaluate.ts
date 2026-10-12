import type { AccountProgram, Automation, Expectation, Loc, Rule, Scenario, Step, Value } from "./model.js";

/** Three-valued truth: a fact that is not recorded yet is unknown, not false. */
export type Truth = true | false | "unknown";

export interface Outcome {
  readonly value: Truth;
  readonly missing: readonly string[];
}

export type Facts = ReadonlyMap<string, Value>;

const known = (value: boolean): Outcome => ({ value, missing: [] });
const unknown = (missing: readonly string[]): Outcome => ({ value: "unknown", missing: [...new Set(missing)] });

const compare = (left: Value, cmp: string, right: Value): boolean => {
  switch (cmp) {
    case "=": return left === right;
    case "not=": return left !== right;
    case ">": return left > right;
    case ">=": return left >= right;
    case "<": return left < right;
    default: return left <= right;
  }
};

export const evaluateRule = (program: AccountProgram, rule: Rule, facts: Facts): Outcome => {
  switch (rule.op) {
    case "and":
    case "or": {
      const decisive = rule.op === "or";
      const outcomes = rule.args.map((arg) => evaluateRule(program, arg, facts));
      if (outcomes.some((outcome) => outcome.value === decisive)) return known(decisive);
      const open = outcomes.filter((outcome) => outcome.value === "unknown");
      return open.length ? unknown(open.flatMap((outcome) => outcome.missing)) : known(!decisive);
    }
    case "not": {
      const outcome = evaluateRule(program, rule.arg, facts);
      return outcome.value === "unknown" ? outcome : known(!outcome.value);
    }
    case "rule": return evaluateRule(program, program.rules.get(rule.name)!, facts);
    case "answer": {
      const value = facts.get(`form.${rule.name}`);
      return value === undefined ? unknown([`form.${rule.name}`]) : known(value === true);
    }
    case "missing": return known(!facts.has(rule.path));
    default: {
      const value = facts.get(rule.path);
      if (value === undefined) return unknown([rule.path]);
      if (rule.op === "is-true") return known(value === true);
      if (rule.op === "in") return known(rule.values.includes(value));
      return known(compare(value, rule.cmp, rule.value));
    }
  }
};

export interface PolicyOutcome extends Outcome {
  readonly policy: string;
  readonly forms: ReadonlyArray<Outcome & { readonly form: string }>;
}

export interface PolicyEvaluation {
  readonly policies: readonly PolicyOutcome[];
  readonly applied: readonly string[];
  readonly forms: readonly string[];
  readonly unknown: Readonly<Record<string, readonly string[]>>;
}

export type Recorder = (decision: string, value: Truth) => void;

/** Which policies apply to a placement, which forms they require, and what is still unknown. */
export const evaluatePolicies = (program: AccountProgram, facts: Facts, record: Recorder = () => {}): PolicyEvaluation => {
  const policies = program.policies.map((policy): PolicyOutcome => {
    const outcome = policy.when ? evaluateRule(program, policy.when, facts) : known(true);
    if (policy.when) record(`${policy.name} :when`, outcome.value);
    const forms = outcome.value !== true ? [] : policy.require.map((entry) => {
      const result = entry.when ? evaluateRule(program, entry.when, facts) : known(true);
      if (entry.when) record(`${policy.name} › ${entry.form} :when`, result.value);
      return { form: entry.form, ...result };
    });
    return { policy: policy.name, ...outcome, forms };
  });
  const unknownMap: Record<string, string[]> = {};
  for (const outcome of policies) {
    if (outcome.value === "unknown") unknownMap[outcome.policy] = [...outcome.missing];
    for (const form of outcome.forms) {
      if (form.value === "unknown") unknownMap[form.form] = [...new Set([...(unknownMap[form.form] ?? []), ...form.missing])];
    }
  }
  return {
    policies,
    applied: policies.filter((outcome) => outcome.value === true).map((outcome) => outcome.policy),
    forms: [...new Set(policies.flatMap((outcome) => outcome.forms.filter((form) => form.value === true).map((form) => form.form)))],
    unknown: unknownMap,
  };
};

/** Every decision a scenario suite should exercise both ways. */
export const decisions = (program: AccountProgram): ReadonlyArray<{ readonly id: string; readonly loc: Loc }> => [
  ...program.policies.flatMap((policy) => [
    ...(policy.when ? [{ id: `${policy.name} :when`, loc: policy.loc }] : []),
    ...policy.require.filter((entry) => entry.when).map((entry) => ({ id: `${policy.name} › ${entry.form} :when`, loc: policy.loc })),
  ]),
  ...program.automations.flatMap((automation) => {
    const conditions = (steps: readonly Step[]): string[] => steps.flatMap((step) =>
      step.kind === "when" ? [step.id, ...conditions(step.then)] : []);
    return conditions(automation.steps).map((id) => ({ id: `${automation.name} › ${id}`, loc: automation.loc }));
  }),
];

export type TimelineKind = "placement" | "policy" | "task" | "automation" | "decision" | "wait" | "email" | "record" | "complete" | "expect";

export interface TimelineEvent {
  readonly day: number;
  readonly kind: TimelineKind;
  readonly text: string;
  readonly detail?: readonly string[];
  readonly ok?: boolean;
}

export interface ScenarioResult {
  readonly title: string;
  readonly line: number;
  readonly ok: boolean;
  readonly timeline: readonly TimelineEvent[];
  readonly failures: ReadonlyArray<{ readonly day: number; readonly loc: Loc; readonly message: string }>;
}

interface Task {
  readonly form: string;
  status: "requires-action" | "completed";
  readonly dueDay?: number;
}

interface Run {
  readonly automation: Automation;
  readonly task?: Task;
  readonly steps: Step[];
  resumeDay: number;
}

/** Show a fact the way it is written in source: choices as keywords, everything else as a literal. */
export const formatValue = (program: AccountProgram, path: string, value: Value): string =>
  program.attributes.get(path)?.type.kind === "enum" ? `:${value}` : JSON.stringify(value);
const truth = (outcome: Outcome): string => outcome.value === "unknown"
  ? `unknown · waiting for ${outcome.missing.join(", ")}` : String(outcome.value);
const sameSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && [...left].sort().every((item, i) => item === [...right].sort()[i]);
const list = (values: readonly string[]) => `[${values.join(" ")}]`;

/** Play one scenario day by day: policies create tasks, automations wait, decide, email, and assign. */
export const runScenario = (program: AccountProgram, scenario: Scenario, record: Recorder = () => {}): ScenarioResult => {
  const facts = new Map(scenario.given);
  const tasks: Task[] = [];
  const waiting: Run[] = [];
  const emails: Array<{ readonly to: string; readonly subject: string; readonly body: string }> = [];
  const timeline: TimelineEvent[] = [];
  const failures: Array<{ day: number; loc: Loc; message: string }> = [];
  let day = 0;
  let evaluation: PolicyEvaluation | undefined;
  const log = (kind: TimelineKind, text: string, extra: { detail?: readonly string[]; ok?: boolean } = {}) =>
    timeline.push({ day, kind, text, ...extra });
  const taskFacts = (task?: Task): Facts => task ? new Map([...facts, ["task.status", task.status]]) : facts;

  const start = (kind: "task-created" | "task-completed" | "placement-created", task?: Task) => {
    for (const automation of program.automations) {
      const { trigger } = automation;
      if (trigger.kind !== kind || ("form" in trigger && trigger.form !== task?.form)) continue;
      log("automation", `${automation.name} started`);
      proceed({ automation, ...(task ? { task } : {}), steps: [...automation.steps], resumeDay: day });
    }
  };
  const assign = (form: string, reason: string) => {
    const dueIn = program.forms.get(form)?.dueIn;
    const task: Task = { form, status: "requires-action", ...(dueIn ? { dueDay: day + dueIn } : {}) };
    tasks.push(task);
    log("task", `${form} assigned${task.dueDay !== undefined ? ` · due day ${task.dueDay}` : ""}`, { detail: [reason] });
    start("task-created", task);
  };
  const proceed = (run: Run) => {
    const name = run.automation.name;
    while (run.steps.length) {
      const step = run.steps.shift()!;
      if (step.kind === "wait") {
        const base = step.after === undefined ? day : step.after === "task.due-at" ? run.task?.dueDay : undefined;
        if (base === undefined) {
          failures.push({ day, loc: run.automation.loc, message: `${name} › ${step.id}: no ${step.after} to wait after` });
          return;
        }
        run.resumeDay = base + step.days;
        if (run.resumeDay > day) {
          log("wait", `${name} waits until day ${run.resumeDay}`, { detail: [step.after ? `${step.days} days after ${step.after}` : `${step.days} days`] });
          waiting.push(run);
          return;
        }
      } else if (step.kind === "when") {
        const outcome = evaluateRule(program, step.rule, taskFacts(run.task));
        record(`${name} › ${step.id}`, outcome.value);
        log("decision", `${name} › ${step.id} is ${truth(outcome)}`);
        if (outcome.value === true) run.steps.unshift(...step.then);
      } else if (step.kind === "email") {
        const values = taskFacts(run.task);
        const body = step.body.replace(/\{\{\s*([a-z_]+)\.([a-z_]+)\s*\}\}/g, (_, entity: string, field: string) =>
          String(values.get(`${entity}.${field.replaceAll("_", "-")}`) ?? ""));
        emails.push({ to: step.to, subject: step.subject, body });
        log("email", `Email to ${step.to}: “${step.subject}”`, { detail: [body, `template: ${step.template} (parameter)`] });
      } else if (tasks.some((task) => task.form === step.form && task.status === "requires-action")) {
        log("task", `${step.form} is already assigned`);
      } else {
        assign(step.form, `assigned by ${name}`);
      }
    }
  };
  const reconcile = () => {
    const next = evaluatePolicies(program, facts, record);
    for (const outcome of next.policies) {
      const before = evaluation?.policies.find((item) => item.policy === outcome.policy);
      if (before && before.value === outcome.value && sameSet(before.missing, outcome.missing)) continue;
      const verdict = outcome.value === true ? "applies" : outcome.value === false ? "does not apply" : `is unknown · waiting for ${outcome.missing.join(", ")}`;
      log("policy", `${outcome.policy} ${verdict}`, {
        detail: outcome.forms.map((form) => `${form.form}: ${form.value === true ? "required" : form.value === false ? "not required" : truth(form)}`),
      });
    }
    evaluation = next;
    for (const form of next.forms) {
      if (tasks.some((task) => task.form === form)) continue;
      const by = next.policies.filter((outcome) => outcome.forms.some((item) => item.form === form && item.value === true));
      assign(form, `required by ${by.map((outcome) => outcome.policy).join(", ")}`);
    }
  };
  const check = (expect: Expectation): string[] => {
    const problems: string[] = [];
    const compareSet = (label: string, expected: readonly string[] | undefined, actual: readonly string[]) => {
      if (expected && !sameSet(expected, actual)) problems.push(`${label}: expected ${list(expected)}, got ${list(actual)}`);
    };
    compareSet("policies", expect.policies, evaluation!.applied);
    compareSet("forms", expect.forms, evaluation!.forms);
    compareSet("tasks", expect.tasks, tasks.map((task) => task.form));
    compareSet("open", expect.open, tasks.filter((task) => task.status === "requires-action").map((task) => task.form));
    if (expect.policies || expect.forms || expect.unknown) {
      const expected = expect.unknown ?? {};
      const actual = evaluation!.unknown;
      const show = (map: Readonly<Record<string, readonly string[]>>) =>
        `{${Object.entries(map).map(([key, paths]) => `${key} ${list(paths)}`).join(", ")}}`;
      const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])];
      if (keys.some((key) => !expected[key] || !actual[key] || !sameSet(expected[key], actual[key]))) {
        problems.push(`unknown: expected ${show(expected)}, got ${show(actual)}`);
      }
    }
    if (expect.emails) {
      const matches = expect.emails.length === emails.length && expect.emails.every((wanted, i) =>
        Object.entries(wanted).every(([key, value]) => emails[i]![key as "to"] === value));
      if (!matches) {
        problems.push(`emails: expected ${expect.emails.length}, got ${emails.length}${emails.length ? ` (${emails.map((email) => `“${email.subject}” → ${email.body}`).join("; ")})` : ""}`);
      }
    }
    return problems;
  };
  const summary = (expect: Expectation): string[] => [
    ...(["policies", "forms", "tasks", "open"] as const).filter((key) => expect[key]).map((key) => `${key} ${list(expect[key]!)}`),
    ...(expect.unknown ? Object.entries(expect.unknown).map(([key, paths]) => `unknown ${key} ${list(paths)}`) : []),
    ...(expect.emails ? [`emails ${expect.emails.length}`] : []),
  ];

  log("placement", "Placement created", { detail: [...facts].map(([path, value]) => `${path} ${formatValue(program, path, value)}`) });
  reconcile();
  start("placement-created");
  for (const { day: target, actions } of scenario.days) {
    for (let next = waiting.filter((run) => run.resumeDay <= target).sort((a, b) => a.resumeDay - b.resumeDay)[0]; next;
      next = waiting.filter((run) => run.resumeDay <= target).sort((a, b) => a.resumeDay - b.resumeDay)[0]) {
      waiting.splice(waiting.indexOf(next), 1);
      day = next.resumeDay;
      proceed(next);
    }
    day = target;
    for (const action of actions) {
      if (action.kind === "record") {
        facts.set(action.path, action.value);
        log("record", `${action.path} recorded as ${formatValue(program, action.path, action.value)}`);
        reconcile();
      } else if (action.kind === "complete") {
        const task = tasks.find((item) => item.form === action.form && item.status === "requires-action");
        if (!task) {
          failures.push({ day, loc: action.loc, message: `complete: no open ${action.form} task` });
          log("complete", `No open ${action.form} task to complete`, { ok: false });
          continue;
        }
        for (const [path, value] of action.writes) facts.set(path, value);
        task.status = "completed";
        log("complete", `${action.form} completed`, { detail: [...action.writes].map(([path, value]) => `${path} ${formatValue(program, path, value)}`) });
        start("task-completed", task);
      } else {
        const problems = check(action.expect);
        for (const message of problems) failures.push({ day, loc: action.loc, message });
        log("expect", problems.length ? "Expectation failed" : "Expectations met", {
          ok: problems.length === 0, detail: problems.length ? problems : summary(action.expect),
        });
      }
    }
  }
  return { title: scenario.title, line: scenario.loc.line, ok: failures.length === 0, timeline, failures };
};

export interface Coverage {
  readonly decision: string;
  readonly loc: Loc;
  readonly seen: Readonly<Record<"true" | "false" | "unknown", readonly string[]>>;
  readonly covered: boolean;
}

/** Run every scenario and report which decision outcomes they exercised. */
export const runScenarios = (program: AccountProgram): { readonly scenarios: readonly ScenarioResult[]; readonly coverage: readonly Coverage[] } => {
  const seen = new Map(decisions(program).map((decision) => [decision.id, { true: new Set<string>(), false: new Set<string>(), unknown: new Set<string>() }]));
  const scenarios = program.scenarios.map((scenario) =>
    runScenario(program, scenario, (decision, value) => seen.get(decision)?.[String(value) as "true"].add(scenario.title)));
  const coverage = decisions(program).map(({ id, loc }): Coverage => {
    const outcomes = seen.get(id)!;
    return {
      decision: id, loc,
      seen: { true: [...outcomes.true], false: [...outcomes.false], unknown: [...outcomes.unknown] },
      covered: outcomes.true.size > 0 && outcomes.false.size > 0,
    };
  });
  return { scenarios, coverage };
};

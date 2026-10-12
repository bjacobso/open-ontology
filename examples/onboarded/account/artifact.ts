import { checkAccount, formatDiagnostic, formatReport } from "./check.js";
import { evaluatePolicies } from "./evaluate.js";
import { applyMistake, mistakes } from "./mistakes.js";
import type { Value } from "./model.js";

export const accountFile = "examples/onboarded/northwind.account.lisp";

/** The facts the site's simulator varies; every combination is evaluated by the real policy evaluator. */
const simulatorFacts: ReadonlyArray<{ readonly path: string; readonly values: readonly Value[] }> = [
  { path: "job.site-type", values: ["warehouse", "office"] },
  { path: "placement.union-local", values: ["local-42", "local-77", "none"] },
  { path: "placement.weekly-hours", values: [12, 32] },
  { path: "client.requires-drug-screen", values: [true, false] },
];

const combinations = <T>(lists: readonly (readonly T[])[]): T[][] =>
  lists.reduce<T[][]>((all, list) => all.flatMap((prefix) => list.map((item) => [...prefix, item])), [[]]);

/** Lines around a diagnostic, for showing the caret under the offending token. */
const excerpt = (source: string, line: number, radius = 2) => {
  const lines = source.split("\n");
  const start = Math.max(1, line - radius);
  return { startLine: start, lines: lines.slice(start - 1, Math.min(lines.length, line + radius)) };
};

const diff = (before: string, after: string) => {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) [endA, endB] = [endA - 1, endB - 1];
  return { line: start + 1, removed: a.slice(start, endA + 1), added: b.slice(start, endB + 1) };
};

/** Everything the /onboarded page shows about the account program, computed from the checked-in source. */
export const buildAccountArtifact = (source: string) => {
  const report = checkAccount(source);
  if (!report.program || !report.ok) throw new Error(`The Northwind account must check cleanly:\n${formatReport(accountFile, report)}`);
  const program = report.program;
  const file = accountFile.split("/").pop()!;
  const kinds: Record<string, number> = {};
  for (const resource of report.resources) kinds[resource.kind] = (kinds[resource.kind] ?? 0) + 1;
  const attribute = (path: string) => program.attributes.get(path)!;
  return {
    file: accountFile,
    command: `pnpm account:check ${accountFile}`,
    output: formatReport(accountFile, report),
    source,
    summary: {
      lines: source.trimEnd().split("\n").length,
      declarations: report.declarations.length,
      resources: report.resources.length,
      kinds,
      scenarios: { passed: report.scenarios.filter((scenario) => scenario.ok).length, total: report.scenarios.length },
      decisions: { covered: report.coverage.filter((item) => item.covered).length, total: report.coverage.length },
    },
    declarations: report.declarations,
    scenarios: report.scenarios.map(({ title, line, ok, timeline }) => ({ title, line, ok, timeline })),
    coverage: report.coverage.map(({ decision, loc, seen, covered }) => ({ decision, line: loc.line, seen, covered })),
    mistakes: mistakes.map((mistake) => {
      const edited = applyMistake(source, mistake);
      const diagnostics = checkAccount(edited).diagnostics;
      const error = diagnostics.find((diagnostic) => diagnostic.severity === "error")!;
      return {
        id: mistake.id, title: mistake.title, why: mistake.why,
        diff: diff(source, edited),
        output: diagnostics.map((diagnostic) => formatDiagnostic(file, diagnostic)),
        caret: { line: error.loc!.line, col: error.loc!.col, length: Math.max(1, error.loc!.end - error.loc!.start) },
        excerpt: excerpt(edited, error.loc!.line),
      };
    }),
    simulator: {
      facts: simulatorFacts.map(({ path, values }) => ({
        path,
        label: attribute(path).label,
        options: values.map((value) => {
          const type = attribute(path).type;
          const label = type.kind === "enum" ? type.options.find((option) => option.value === value)!.label : String(value);
          return { value: String(value), label };
        }),
      })),
      policies: program.policies.map((policy) => ({ name: policy.name, title: policy.title })),
      outcomes: Object.fromEntries(combinations(simulatorFacts.map(({ values }) => [...values, undefined])).map((choice) => {
        const facts = new Map<string, Value>();
        choice.forEach((value, i) => {
          if (value !== undefined) facts.set(simulatorFacts[i]!.path, value);
        });
        const evaluation = evaluatePolicies(program, facts);
        return [choice.map((value) => value === undefined ? "" : String(value)).join("|"), {
          policies: evaluation.policies,
          forms: evaluation.forms,
          unknown: evaluation.unknown,
        }];
      })),
    },
  };
};

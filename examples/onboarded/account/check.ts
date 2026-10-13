import { elaborateAccount } from "./elaborate.js";
import { runScenarios, type Coverage, type ScenarioResult } from "./evaluate.js";
import { lowerDeclarations, type Resource } from "./lower.js";
import type { AccountProgram, Declaration, Diagnostic } from "./model.js";

export interface AccountReport {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly program?: AccountProgram;
  readonly declarations: ReadonlyArray<Declaration & { readonly resources: readonly Resource[] }>;
  readonly resources: readonly Resource[];
  readonly scenarios: readonly ScenarioResult[];
  readonly coverage: readonly Coverage[];
}

/** Elaborate, lower, and simulate an account. Failing scenarios and uncovered decisions are errors. */
export const checkAccount = (source: string): AccountReport => {
  const { program, diagnostics } = elaborateAccount(source);
  if (!program) return { ok: false, diagnostics, declarations: [], resources: [], scenarios: [], coverage: [] };
  const lowered = lowerDeclarations(program);
  const declarations = program.declarations.map((declaration, index) => ({ ...declaration, resources: lowered[index]!.resources }));
  const { scenarios, coverage } = runScenarios(program);
  const problems: Diagnostic[] = [
    ...scenarios.flatMap((scenario) => scenario.failures.map((failure): Diagnostic => ({
      severity: "error", message: `Scenario “${scenario.title}”, day ${failure.day}: ${failure.message}`, loc: failure.loc,
    }))),
    ...coverage.filter((item) => !item.covered).map((item): Diagnostic => ({
      severity: "error",
      message: `${item.decision} is never ${item.seen.true.length ? "false" : item.seen.false.length ? "true" : "true or false"} in any scenario`,
      loc: item.loc,
    })),
  ];
  const all = [...diagnostics, ...problems];
  return {
    ok: !all.some((diagnostic) => diagnostic.severity === "error"), diagnostics: all, program, declarations,
    resources: declarations.flatMap((declaration) => declaration.resources), scenarios, coverage,
  };
};

export const formatDiagnostic = (file: string, diagnostic: Diagnostic): string =>
  `${file}${diagnostic.loc ? `:${diagnostic.loc.line}:${diagnostic.loc.col}` : ""} ${diagnostic.severity}: ${diagnostic.message}`;

export const formatReport = (file: string, report: AccountReport): string => {
  const lines = report.diagnostics.map((diagnostic) => formatDiagnostic(file, diagnostic));
  if (!report.program) return [...lines, `${file}: does not elaborate`].join("\n");
  const kinds = new Map<string, number>();
  for (const resource of report.resources) kinds.set(resource.kind, (kinds.get(resource.kind) ?? 0) + 1);
  const passed = report.scenarios.filter((scenario) => scenario.ok).length;
  const covered = report.coverage.filter((item) => item.covered).length;
  return [
    ...lines,
    `${file}: ${report.ok ? "ok" : "failed"}`,
    `  resources  ${report.resources.length} (${[...kinds].map(([kind, count]) => `${count} ${kind}`).join(", ")})`,
    `  scenarios  ${passed} of ${report.scenarios.length} passed`,
    ...report.scenarios.map((scenario) => `    ${scenario.ok ? "✓" : "✗"} ${scenario.title}`),
    `  coverage   ${covered} of ${report.coverage.length} decisions seen true and false`,
  ].join("\n");
};

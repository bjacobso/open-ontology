/** Repository-only spike: no stable export, runtime entry point, or authorization semantics. */
import { Schema, type JsonSchema } from "effect";
import type { ActionTypeDefinition, OntologyDefinition, QueryTypeDefinition } from "../model.js";
import { actionInputSchemaFromFields, materializeOntology, ontologyToIR } from "../materialize.js";
import type { OntologyIR } from "../ir.js";
import type { SkillIR, SkillModelIR, SkillStepIR, SkillValueIR } from "./skills-ir.js";

export type { SkillIR, SkillModelIR, SkillStepIR, SkillValueIR } from "./skills-ir.js";

export const Skill = {
  define: (name: string, options: Omit<SkillIR, "kind" | "name">): SkillIR => ({
    kind: "agent-skill", name, ...options,
  }),
  input: (name: string): SkillValueIR => ({ kind: "input", name }),
  query: (query: string | QueryTypeDefinition<any>, instruction: string): SkillStepIR => ({
    kind: "query", query: typeof query === "string" ? query : query.name, instruction,
  }),
  action: <I>(
    action: string | ActionTypeDefinition<I>,
    input: Readonly<Record<string, SkillValueIR>>,
    instruction: string,
  ): SkillStepIR => ({
    kind: "action", action: typeof action === "string" ? action : action.name, input, instruction,
  }),
  guard: (
    query: string | QueryTypeDefinition<any>,
    expect: "empty" | "nonempty",
    instruction: string,
  ): SkillStepIR => ({
    kind: "guard", query: typeof query === "string" ? query : query.name, expect, instruction,
  }),
  stop: (instruction: string): SkillStepIR => ({ kind: "stop", instruction }),
};

export const defineSkillModel = (
  ontology: OntologyDefinition | OntologyIR,
  skills: readonly SkillIR[],
): SkillModelIR => ({
  kind: "experimental-skill-model", formatVersion: 1,
  ontology: "kind" in ontology ? ontology : ontologyToIR(ontology), skills,
});

export interface SkillDiagnostic {
  readonly name: string;
  readonly message: string;
}

/** Static checks on the finite procedure. Query satisfiability and prose are not checked. */
export const checkSkills = (model: SkillModelIR): readonly SkillDiagnostic[] => {
  const errors: SkillDiagnostic[] = [];
  const ontology = materializeOntology(model.ontology);
  const names = new Set<string>();
  for (const skill of model.skills) {
    const error = (message: string) => errors.push({ name: skill.name, message: `Skill ${skill.name}: ${message}` });
    if (!/^[a-z][a-z0-9-]*$/.test(skill.name)) error("name must be kebab-case");
    if (names.has(skill.name)) error("duplicate skill declaration");
    names.add(skill.name);
    if (!skill.purpose.trim()) error("purpose must be nonempty");
    if (!skill.steps.length) error("procedure must have at least one step");
    const inputs = new Set(skill.inputs);
    if (inputs.size !== skill.inputs.length) error("duplicate input name");
    for (const name of inputs) {
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) error(`invalid input name ${name}`);
    }
    const used = new Set<string>();
    let stopped = false;
    for (const [index, step] of skill.steps.entries()) {
      const label = `step ${index + 1}`;
      if (stopped) error(`${label} is unreachable after stop`);
      if (!step.instruction.trim()) error(`${label} needs an instruction`);
      if (step.kind === "stop") { stopped = true; continue; }
      if (step.kind === "query" || step.kind === "guard") {
        if (!ontology.queryTypes.has(step.query)) error(`${label} references unknown query ${step.query}`);
        if (step.kind === "guard" && step.expect !== "empty" && step.expect !== "nonempty") {
          error(`${label} has an invalid guard expectation`);
        }
        continue;
      }
      const action = ontology.actionTypes.get(step.action);
      if (!action) error(`${label} references unknown action ${step.action}`);
      for (const [key, value] of Object.entries(step.input)) {
        if (action && !action.inputFields.some(({ name }) => name === key)) {
          error(`${label} supplies unknown action input ${key}`);
        }
        if (typeof value === "object" && value !== null) {
          if (!inputs.has(value.name)) error(`${label} uses unbound input ${value.name}`);
          used.add(value.name);
        }
      }
      for (const field of action?.inputFields ?? []) {
        if (!field.optional && !Object.hasOwn(step.input, field.name)) {
          error(`${label} is missing required action input ${field.name}`);
        }
      }
      // Fully literal invocations can be checked against the complete portable contract.
      if (action && Object.values(step.input).every((value) => typeof value !== "object" || value === null)) {
        try { Schema.decodeUnknownSync(action.input)(step.input); }
        catch { error(`${label} literals do not satisfy action ${step.action}'s input schema`); }
      }
    }
    for (const name of inputs) if (!used.has(name)) error(`input ${name} is never used by an action`);
    for (const [index, example] of skill.examples.entries()) {
      const label = `example ${index + 1}`;
      if (!example.description.trim()) error(`${label} needs a description`);
      for (const name of inputs) {
        if (!Object.hasOwn(example.input, name)) error(`${label} is missing input ${name}`);
      }
      for (const name of Object.keys(example.input)) {
        if (!inputs.has(name)) error(`${label} supplies unknown input ${name}`);
      }
      for (const step of skill.steps) {
        if (step.kind !== "action") continue;
        const action = ontology.actionTypes.get(step.action);
        if (!action) continue;
        const input = Object.fromEntries(Object.entries(step.input).map(([name, value]) => [
          name, typeof value === "object" && value !== null ? example.input[value.name] : value,
        ]));
        try { Schema.decodeUnknownSync(action.input)(input); }
        catch { error(`${label} does not satisfy action ${step.action}'s input schema`); }
      }
    }
  }
  return errors;
};

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);
const code = (value: unknown): string => `\`\`\`json\n${pretty(value)}\n\`\`\``;
const valueLabel = (value: SkillValueIR): string =>
  typeof value === "object" && value !== null ? `$${value.name}` : JSON.stringify(value);

// Effect stores definitions separately; tools need a standalone schema with resolvable refs.
const toolInputSchema = (document: JsonSchema.Document<"draft-2020-12">): JsonSchema.JsonSchema => ({
  ...document.schema,
  ...(Object.keys(document.definitions).length ? { $defs: document.definitions } : {}),
});

/** Generate reviewable text and tool descriptors. No tools are registered or invoked. */
export const compileSkillArtifacts = (model: SkillModelIR, name: string) => {
  const errors = checkSkills(model);
  if (errors.length) throw new TypeError(errors.map(({ message }) => message).join("\n"));
  const skill = model.skills.find((candidate) => candidate.name === name);
  if (!skill) throw new TypeError(`Unknown skill ${name}`);
  const actions = model.ontology.actionTypes.filter((action) =>
    skill.steps.some((step) => step.kind === "action" && step.action === action.name));
  const queries = model.ontology.queryTypes.filter((query) =>
    skill.steps.some((step) => (step.kind === "query" || step.kind === "guard") && step.query === query.name));
  const tools = [
    ...actions.map((action) => ({
      name: `action__${action.name}`, kind: "action" as const, declaration: action.name,
      description: action.description ?? `Invoke ${action.name} as one Triplex transaction.`,
      inputSchema: toolInputSchema(action.inputSchema ?? actionInputSchemaFromFields(action.input)),
    })),
    ...queries.map((query) => ({
      name: `query__${query.name}`, kind: "query" as const, declaration: query.name,
      description: query.description ?? `Run ${query.name}; return all matching rows.`,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputColumns: query.query.find,
    })),
  ];
  const steps = skill.steps.map((step, index) => {
    const prefix = `${index + 1}. ${step.instruction}`;
    switch (step.kind) {
      case "query": return `${prefix} Call \`query__${step.query}\` with no arguments.`;
      case "guard": return `${prefix} Call \`query__${step.query}\` with no arguments; continue only if results are ${step.expect}. Otherwise stop.`;
      case "action": return `${prefix} Call \`action__${step.action}\` with ${Object.entries(step.input).map(([key, value]) => `\`${key}=${valueLabel(value)}\``).join(", ")}.`;
      case "stop": return `${prefix} Stop.`;
    }
  });
  const skillMarkdown = [
    "---", `name: ${skill.name}`, `description: ${JSON.stringify(skill.purpose)}`, "---", "",
    `# ${skill.name}`, "", skill.purpose, "",
    `Required caller inputs: ${skill.inputs.map((input) => `\`${input}\``).join(", ") || "none"}.`, "",
    "## Preconditions", "", ...skill.preconditions.map((condition) => `- ${condition}`), "",
    "## Procedure", "", ...steps, "",
    "## Tool contracts", "", ...tools.flatMap((tool) => [`### ${tool.name}`, "", code(tool), ""]),
    "## Examples", "", ...skill.examples.flatMap((example) => [example.description, "", code(example.input), ""]),
    "## Execution boundary", "",
    "The agent follows this procedure. Guards and preconditions are instructions; each action is a separate transaction. The host must enforce authorization and recheck state when it matters.", "",
  ].join("\n");
  return {
    skillMarkdown,
    llmsText: [`### Skill: ${skill.name}`, "", skill.purpose, "", ...steps, "", `Full contract: skills/${skill.name}/SKILL.md`, ""].join("\n"),
    tools,
  };
};

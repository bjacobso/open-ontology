/** Experimental authoring metadata. Deliberately separate from OntologyIR and its runtime. */
import type { OntologyIR } from "../ir.js";

export type SkillLiteralIR = string | number | boolean | null;
export type SkillValueIR = SkillLiteralIR | { readonly kind: "input"; readonly name: string };

export type SkillStepIR =
  | { readonly kind: "query"; readonly query: string; readonly instruction: string }
  | {
      readonly kind: "action";
      readonly action: string;
      readonly input: Readonly<Record<string, SkillValueIR>>;
      readonly instruction: string;
    }
  | {
      readonly kind: "guard";
      readonly query: string;
      readonly expect: "empty" | "nonempty";
      readonly instruction: string;
    }
  | { readonly kind: "stop"; readonly instruction: string };

export interface SkillIR {
  readonly kind: "agent-skill";
  readonly name: string;
  readonly purpose: string;
  /** Required caller-supplied names. Action contracts supply their types. */
  readonly inputs: readonly string[];
  /** Human/agent obligations, not transaction guards. */
  readonly preconditions: readonly string[];
  readonly steps: readonly SkillStepIR[];
  readonly examples: readonly {
    readonly input: Readonly<Record<string, SkillLiteralIR>>;
    readonly description: string;
  }[];
}

export interface SkillModelIR {
  readonly kind: "experimental-skill-model";
  readonly formatVersion: 1;
  readonly ontology: OntologyIR;
  readonly skills: readonly SkillIR[];
}

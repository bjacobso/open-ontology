/** The elaborated account program. Source names stay kebab-case; lowering maps them to platform names. */

export interface Loc {
  readonly line: number;
  readonly col: number;
  readonly start: number;
  readonly end: number;
}

export interface Diagnostic {
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly loc?: Loc;
}

export type Entity = "employee" | "employer" | "client" | "job" | "placement" | "task";
export type Scalar = "string" | "boolean" | "date" | "datetime" | "integer" | "decimal" | "address";
export type AttributeType =
  | { readonly kind: Scalar }
  | { readonly kind: "enum"; readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }> };

export interface Attribute {
  readonly entity: Entity;
  readonly name: string;
  readonly path: string;
  readonly type: AttributeType;
  readonly label: string;
  readonly builtin: boolean;
  readonly searchable: boolean;
  readonly sensitive: boolean;
  readonly scope: boolean;
  readonly pattern?: string;
  readonly deprecated?: string;
  readonly loc?: Loc;
}

/** Enum values are their keyword names without the colon. */
export type Value = string | number | boolean;

export type Comparison = "=" | "not=" | ">" | ">=" | "<" | "<=";

export type Rule =
  | { readonly op: "and" | "or"; readonly args: readonly Rule[] }
  | { readonly op: "not"; readonly arg: Rule }
  | { readonly op: "compare"; readonly cmp: Comparison; readonly path: string; readonly value: Value }
  | { readonly op: "in"; readonly path: string; readonly values: readonly Value[] }
  | { readonly op: "is-true"; readonly path: string }
  | { readonly op: "missing"; readonly path: string }
  | { readonly op: "rule"; readonly name: string }
  | { readonly op: "answer"; readonly name: string };

export type Formula =
  | { readonly op: "number"; readonly value: number }
  | { readonly op: "path"; readonly path: string }
  | { readonly op: "answer"; readonly name: string }
  | { readonly op: "call"; readonly fn: "+" | "-" | "*" | "/" | "round"; readonly args: readonly Formula[] };

export type FieldTarget = { readonly path: string } | { readonly answer: string };

export interface Field {
  readonly kind: string;
  readonly target?: FieldTarget;
  readonly label?: string;
  readonly required: boolean;
  readonly showIf?: Rule;
  readonly translations: Readonly<Record<string, string>>;
  readonly formula?: Formula;
  readonly rows?: readonly FieldTarget[];
  readonly text?: string;
}

export interface Page {
  readonly title: string;
  readonly assignee: "employee" | "employer";
  readonly fields: readonly Field[];
}

export interface Form {
  readonly name: string;
  readonly key: string;
  readonly title?: string;
  readonly from?: string;
  readonly dueIn?: number;
  readonly pages: readonly Page[];
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly loc: Loc;
}

export interface Policy {
  readonly name: string;
  readonly key: string;
  readonly title: string;
  readonly when?: Rule;
  readonly require: ReadonlyArray<{ readonly form: string; readonly when?: Rule }>;
  readonly loc: Loc;
}

export type Trigger =
  | { readonly kind: "task-created" | "task-completed"; readonly form: string }
  | { readonly kind: "placement-created" };

export type Step =
  | { readonly kind: "wait"; readonly id: string; readonly days: number; readonly after?: string }
  | { readonly kind: "when"; readonly id: string; readonly rule: Rule; readonly then: readonly Step[] }
  | { readonly kind: "email"; readonly id: string; readonly to: "employee" | "employer"; readonly template: string;
      readonly subject: string; readonly body: string }
  | { readonly kind: "assign"; readonly id: string; readonly form: string };

export interface Automation {
  readonly name: string;
  readonly key: string;
  readonly title: string;
  readonly trigger: Trigger;
  readonly steps: readonly Step[];
  readonly loc: Loc;
}

export interface Group {
  readonly name: string;
  readonly title: string;
  readonly permissions: readonly string[];
  readonly sees?: Rule;
  readonly loc: Loc;
}

export interface Integration {
  readonly name: string;
  readonly provider: string;
  readonly revision: string;
  readonly connection: string;
  readonly settings: Readonly<Record<string, Value>>;
  readonly loc: Loc;
}

export interface Param {
  readonly name: string;
  readonly type: string;
  readonly doc?: string;
  readonly loc: Loc;
}

export interface EmailExpectation {
  readonly to?: string;
  readonly subject?: string;
  readonly body?: string;
}

export interface Expectation {
  readonly policies?: readonly string[];
  readonly forms?: readonly string[];
  readonly unknown?: Readonly<Record<string, readonly string[]>>;
  readonly tasks?: readonly string[];
  readonly open?: readonly string[];
  readonly emails?: readonly EmailExpectation[];
}

export type ScenarioAction =
  | { readonly kind: "expect"; readonly expect: Expectation; readonly loc: Loc }
  | { readonly kind: "complete"; readonly form: string; readonly writes: ReadonlyMap<string, Value>; readonly loc: Loc }
  | { readonly kind: "record"; readonly path: string; readonly value: Value; readonly loc: Loc };

export interface Scenario {
  readonly title: string;
  readonly given: ReadonlyMap<string, Value>;
  readonly days: ReadonlyArray<{ readonly day: number; readonly actions: readonly ScenarioAction[] }>;
  readonly loc: Loc;
}

export interface Account {
  readonly name: string;
  readonly title: string;
  readonly languages: readonly string[];
  readonly sender?: string;
  readonly support?: string;
  readonly dedupe: readonly string[];
}

export interface Declaration {
  readonly verb: string;
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface AccountProgram {
  readonly account: Account;
  readonly attributes: ReadonlyMap<string, Attribute>;
  readonly rules: ReadonlyMap<string, Rule>;
  readonly constants: ReadonlyMap<string, number>;
  readonly forms: ReadonlyMap<string, Form>;
  readonly policies: readonly Policy[];
  readonly params: ReadonlyMap<string, Param>;
  readonly automations: readonly Automation[];
  readonly groups: readonly Group[];
  readonly integrations: readonly Integration[];
  readonly scenarios: readonly Scenario[];
  readonly declarations: readonly Declaration[];
}

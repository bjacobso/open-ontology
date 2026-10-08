import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Effect, JsonSchema, Schema } from "effect";
import { EntityId, KvTriples, Triples, datetime, number, ref, string, type TripleValue, type TransactOp } from "@triplex-build/triplex";
import { Ontology, defineOntology, elaborateFormaOntology, makeOntologyRuntime } from "../src/index.js";
import { checkFormaSource, checkModelFile } from "../scripts/check-model.js";
import { Skill, checkSkills, compileSkillArtifacts, defineSkillModel, type SkillIR } from "../src/experimental/skills.js";
import { elaborateFormaSkillModel, splitSkillForms } from "../src/experimental/skills-forma.js";
import { Dispatch } from "../examples/skills/dispatch.js";
import { skillModel } from "../examples/skills/model.js";

const source = readFileSync(new URL("../examples/skills/model.lisp", import.meta.url), "utf8");
const messages = (skill: SkillIR) => checkSkills({ ...skillModel, skills: [skill] }).map(({ message }) => message);

describe("experimental agent skills", () => {
  it("produces equivalent, JSON-safe Forma and TypeScript IR", () => {
    const forma = elaborateFormaSkillModel(source, { name: "skills-field-service", version: "1" });
    expect(forma).toEqual(skillModel);
    expect(JSON.parse(JSON.stringify(forma))).toEqual(forma);
    expect(checkSkills(forma)).toEqual([]);
    const declaration = readFileSync(new URL("../examples/skills/dispatch.lisp", import.meta.url), "utf8");
    expect(source.endsWith(declaration)).toBe(true);
  });

  it("requires an explicit checker opt-in on both surfaces", async () => {
    expect(checkFormaSource(source, { name: "skills" }).ok).toBe(false);
    for (const file of ["examples/skills/model.lisp", "examples/skills/model.ts"]) {
      expect(await checkModelFile(file, { experimentalSkills: true }))
        .toMatchObject({ ok: true, diagnostics: [], skills: [Dispatch] });
    }
    expect(await checkModelFile("examples/field-service/model.ts", { experimentalSkills: true }))
      .toMatchObject({ ok: false });
  });

  it("rejects unknown action and query references, including guards", () => {
    expect(messages({ ...Dispatch, steps: [
      Skill.action("typo-action", {}, "Call."), Skill.query("typo-query", "Read."),
      Skill.guard("typo-guard", "empty", "Check."),
    ] })).toEqual(expect.arrayContaining([
      "Skill dispatch-work: step 1 references unknown action typo-action",
      "Skill dispatch-work: step 2 references unknown query typo-query",
      "Skill dispatch-work: step 3 references unknown query typo-guard",
    ]));
  });

  it("rejects unbound names, omitted required arguments, and extra arguments", () => {
    expect(messages({ ...Dispatch, steps: [Skill.action("assign-work-order", {
      workOrder: Skill.input("workOder"), extra: "extra",
    }, "Assign.")] })).toEqual(expect.arrayContaining([
      "Skill dispatch-work: step 1 uses unbound input workOder",
      "Skill dispatch-work: step 1 supplies unknown action input extra",
      "Skill dispatch-work: step 1 is missing required action input technician",
    ]));
  });

  it("rejects unreachable steps after stop, without treating conditional guards as stops", () => {
    expect(messages({ ...Dispatch, steps: [...Dispatch.steps, Skill.stop("Done."), Skill.query("assigned-work", "Read.")] }))
      .toContain("Skill dispatch-work: step 7 is unreachable after stop");
    expect(messages(Dispatch)).toEqual([]);
  });

  it("checks duplicate declarations, names, purpose, and empty procedures", () => {
    expect(checkSkills({ ...skillModel, skills: [Dispatch, Dispatch] }).map(({ message }) => message))
      .toContain("Skill dispatch-work: duplicate skill declaration");
    expect(messages({ ...Dispatch, name: "BadName", purpose: "", steps: [] }))
      .toEqual(expect.arrayContaining([
        "Skill BadName: name must be kebab-case", "Skill BadName: purpose must be nonempty",
        "Skill BadName: procedure must have at least one step",
      ]));
    expect(messages({ ...Dispatch, inputs: ["workOrder", "workOrder", "unused"] }))
      .toEqual(expect.arrayContaining([
        "Skill dispatch-work: duplicate input name", "Skill dispatch-work: input unused is never used by an action",
      ]));
  });

  it("validates examples and fully literal calls against complete action input schemas", () => {
    expect(messages({ ...Dispatch, examples: [{ input: { workOrder: 42, technician: "tech" }, description: "Bad." }] }))
      .toContain("Skill dispatch-work: example 1 does not satisfy action assign-work-order's input schema");
    expect(messages({ ...Dispatch, examples: [{ input: { workOrder: "work", extra: "x" }, description: "Bad." }] }))
      .toEqual(expect.arrayContaining([
        "Skill dispatch-work: example 1 is missing input technician",
        "Skill dispatch-work: example 1 supplies unknown input extra",
      ]));
    expect(messages({ ...Dispatch, inputs: [], examples: [], steps: [
      Skill.action("assign-work-order", { workOrder: 42, technician: "tech" }, "Assign."),
    ] })).toContain("Skill dispatch-work: step 1 literals do not satisfy action assign-work-order's input schema");
  });

  it("preserves complete portable contracts and separates same-named actions and queries", () => {
    const action = Ontology.ActionType("lookup", {
      input: Schema.Struct({ value: Schema.String.check(Schema.isMinLength(2)).annotate({ identifier: "Text" }) }), changes: [],
    });
    const query = Ontology.QueryType("lookup", { query: { find: [], where: [] } });
    const model = defineSkillModel(defineOntology({ name: "contracts" }, [action, query]), [
      Skill.define("look-up", {
        purpose: "Look up.", inputs: [], preconditions: [], examples: [],
        steps: [Skill.action(action, { value: "ok" }, "Act."), Skill.query(query, "Read.")],
      }),
    ]);
    const artifacts = compileSkillArtifacts(model, "look-up");
    expect(artifacts.tools.map(({ name }) => name)).toEqual(["action__lookup", "query__lookup"]);
    expect(artifacts.tools[0]?.inputSchema).toMatchObject({
      properties: { value: { $ref: "#/$defs/Text" } }, $defs: { Text: { minLength: 2 } },
    });
    const restored = JsonSchema.fromSchemaDraft2020_12(artifacts.tools[0]!.inputSchema);
    expect(restored.definitions.Text).toMatchObject({ minLength: 2 });
    expect(checkSkills({ ...model, skills: [{ ...model.skills[0]!, steps: [Skill.action(action, { value: "x" }, "Act.")] }] }))
      .toHaveLength(1);
  });

  it("reproduces the manually maintained before contract with the same behavior", () => {
    const artifacts = compileSkillArtifacts(skillModel, "dispatch-work");
    expect(artifacts.skillMarkdown).toBe(readFileSync(new URL("../examples/skills/before/SKILL.md", import.meta.url), "utf8"));
    expect(artifacts.tools).toHaveLength(4);
    expect(artifacts.llmsText).toContain("Full contract: skills/dispatch-work/SKILL.md");
    expect(() => compileSkillArtifacts({ ...skillModel, skills: [{ ...Dispatch, steps: [Skill.query("missing", "Read.")] }] }, "dispatch-work"))
      .toThrow("unknown query missing");
    expect(() => compileSkillArtifacts(skillModel, "missing")).toThrow("Unknown skill missing");
  });

  it("rejects malformed slots and duplicate map keys with source locations", () => {
    for (const slot of [
      '(:unknown "x")', '(:query technicians "x" "extra")',
      '(:action assign-work-order {:workOrder workOrder :workOrder technician} "x")',
      '(:guard technicians maybe "x")', '(:purpose "one") (:purpose "two")',
    ]) {
      const result = checkFormaSource(`(define-skill bad\n  ${slot})`, { name: "test", experimentalSkills: true });
      expect(result).toMatchObject({ ok: false, diagnostics: [{ severity: "error", line: 2 }] });
    }
  });

  it("locates skill errors and preserves core source locations across masked skill forms", () => {
    const result = checkFormaSource(source.replace("(:action assign-work-order", "(:action missing-action"), {
      name: "skills", experimentalSkills: true,
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ severity: "error", line: source.slice(0, source.indexOf("(define-skill")).split("\n").length });
    const invalid = '(define-skill first (:purpose "😀") (:query missing "Read."))\n(define-relation broken Missing AlsoMissing)';
    expect(() => elaborateFormaSkillModel(invalid, { name: "test" }))
      .toThrow("unknown endpoints");
    const core = splitSkillForms(invalid).coreSource;
    expect(core.length).toBe(invalid.length);
    expect(checkFormaSource(invalid, { name: "test", experimentalSkills: true }).diagnostics[0]?.line).toBe(2);
  });

  it("keeps the domain qualification example in today's closed language", async () => {
    expect(await checkModelFile("examples/skills/domain-before.lisp"))
      .toMatchObject({ ok: true, diagnostics: [] });
    expect(() => elaborateFormaOntology(source, { name: "stable" })).toThrow();
  });

  it("matches qualification levels and excludes expiry at or before the recorded time", async () => {
    const domain = readFileSync(new URL("../examples/skills/domain-before.lisp", import.meta.url), "utf8");
    const runtime = makeOntologyRuntime(elaborateFormaOntology(domain, { name: "qualifications" }));
    const seed: TransactOp[] = [];
    const fact = (id: string, type: string, attribute: string, value: TripleValue) => {
      seed.push({ op: "assert", entityId: EntityId.make(id), entityType: type, attribute, value });
    };
    fact("work:1", "WorkOrder", ":work-order/trade", string("HVAC"));
    fact("work:1", "WorkOrder", ":work-order/min-level", number(2));
    fact("work:1", "WorkOrder", ":work-order/match-at", datetime(1000));
    fact("cert:hvac", "Certification", ":certification/code", string("HVAC"));
    for (const [id, level, expiry] of [["ada", 3, 2000], ["expired", 3, 1000], ["old", 3, 999], ["junior", 1, 2000]] as const) {
      fact(`tech:${id}`, "Technician", ":technician/name", string(id));
      fact(`grant:${id}`, "QualifiedInLink", ":qualified-in/from", ref(EntityId.make(`tech:${id}`)));
      fact(`grant:${id}`, "QualifiedInLink", ":qualified-in/to", ref(EntityId.make("cert:hvac")));
      fact(`grant:${id}`, "QualifiedInLink", ":qualified-in/level", number(level));
      fact(`grant:${id}`, "QualifiedInLink", ":qualified-in/expires-at", datetime(expiry));
    }
    const rows = await Effect.runPromise(Effect.gen(function* () {
      const triples = yield* Triples;
      yield* triples.transact(seed);
      return (yield* runtime.query("eligible-technicians")).results;
    }).pipe(Effect.provide(KvTriples.layer)));
    expect(rows).toEqual([{ "?workOrder": "work:1", "?technician": "tech:ada", "?name": "ada", "?level": 3 }]);
  });
});

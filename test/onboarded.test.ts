import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { onboarded } from "../examples/onboarded/model.js";
import { permissionProperties, runOnboardedScenario } from "../examples/onboarded/scenario.js";
import { checkModelFile } from "../scripts/check-model.js";
import { ontologyToIR } from "../src/index.js";

describe("illustrative Onboarded ontology", () => {
  it("checks without errors or warnings", async () => {
    const result = await checkModelFile(new URL("../examples/onboarded/model.ts", import.meta.url).pathname);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("joins tasks to versioned forms and replaces the employer assignee on reassignment", async () => {
    expect(await runOnboardedScenario()).toEqual({
      forms: [{ "?lineageName": "Example onboarding form", "?formName": "Example form v1", "?status": "published" }],
      before: {
        tasks: [{ "?employeeName": "Ada Example", "?formName": "Example form v1", "?status": "requires_action", "?nextAction": "employee-input" }],
        queue: [],
      },
      after: {
        tasks: [{ "?employeeName": "Ada Example", "?formName": "Example form v1", "?status": "requires_action", "?nextAction": "employer-review" }],
        queue: [{ "?employeeName": "Ada Example", "?assigneeEmail": "grace@example.invalid" }],
      },
      reassigned: { queue: [{ "?employeeName": "Ada Example", "?assigneeEmail": "lee@example.invalid" }] },
    });
  });

  it("keeps the site's exported ontology and transcript in sync with executable code", async () => {
    const artifact = JSON.parse(readFileSync(new URL("../apps/site/public/onboarded/model.json", import.meta.url), "utf8"));
    const views = JSON.parse(readFileSync(new URL("../apps/site/onboarded-views.json", import.meta.url), "utf8"));
    expect(artifact).toEqual({ ontology: ontologyToIR(onboarded), scenario: await runOnboardedScenario(), permissionProperties, views });
  });

  it("makes every modeled object reachable in a graph view without references to missing objects", () => {
    const views = JSON.parse(readFileSync(new URL("../apps/site/onboarded-views.json", import.meta.url), "utf8")) as Record<string, {
      focus: string; positions: Record<string, [number, number]>;
    }>;
    const names = ontologyToIR(onboarded).objectTypes.map((item) => item.name);
    expect([...new Set(Object.values(views).flatMap((view) => Object.keys(view.positions)))].sort()).toEqual([...names].sort());
    for (const view of Object.values(views)) expect(view.positions).toHaveProperty(view.focus);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { onboarded } from "../examples/onboarded/model.js";
import { runOnboardedScenario } from "../examples/onboarded/scenario.js";
import { checkModelFile } from "../scripts/check-model.js";
import { ontologyToIR } from "../src/index.js";

describe("illustrative Onboarded ontology", () => {
  it("checks without errors or warnings", async () => {
    const result = await checkModelFile(new URL("../examples/onboarded/model.ts", import.meta.url).pathname);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("replaces the draft status and joins the assigned reviewer into the queue", async () => {
    expect(await runOnboardedScenario()).toEqual({
      before: {
        cases: [{ "?employeeName": "Ada Example", "?accountName": "Example Co.", "?status": "draft" }],
        queue: [],
      },
      after: {
        cases: [{ "?employeeName": "Ada Example", "?accountName": "Example Co.", "?status": "awaiting-review" }],
        queue: [{ "?employeeName": "Ada Example", "?reviewerName": "Grace Example" }],
      },
    });
  });

  it("keeps the site's exported ontology and transcript in sync with executable code", async () => {
    const artifact = JSON.parse(readFileSync(new URL("../apps/site/public/onboarded/model.json", import.meta.url), "utf8"));
    expect(artifact).toEqual({ ontology: ontologyToIR(onboarded), scenario: await runOnboardedScenario() });
  });
});

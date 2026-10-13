import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accountFile, buildAccountArtifact } from "../examples/onboarded/account/artifact.js";
import { checkAccount } from "../examples/onboarded/account/check.js";
import { elaborateAccount } from "../examples/onboarded/account/elaborate.js";
import { evaluatePolicies } from "../examples/onboarded/account/evaluate.js";
import { applyMistake, mistakes } from "../examples/onboarded/account/mistakes.js";
import { onboarded } from "../examples/onboarded/model.js";
import { runOnboardedScenario } from "../examples/onboarded/scenario.js";
import { checkModelFile } from "../scripts/check-model.js";
import { ontologyToIR } from "../src/index.js";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const northwind = read(accountFile);

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
    const artifact = JSON.parse(read("apps/site/public/onboarded/model.json"));
    const views = JSON.parse(read("apps/site/onboarded-views.json"));
    expect(artifact).toEqual({ ontology: ontologyToIR(onboarded), scenario: await runOnboardedScenario(), views });
  });

  it("makes every modeled object reachable in a graph view without references to missing objects", () => {
    const views = JSON.parse(read("apps/site/onboarded-views.json")) as Record<string, {
      focus: string; positions: Record<string, [number, number]>;
    }>;
    const names = ontologyToIR(onboarded).objectTypes.map((item) => item.name);
    expect([...new Set(Object.values(views).flatMap((view) => Object.keys(view.positions)))].sort()).toEqual([...names].sort());
    for (const view of Object.values(views)) expect(view.positions).toHaveProperty(view.focus);
  });
});

describe("Northwind account program", () => {
  it("elaborates, passes every scenario, and covers every decision both ways", () => {
    const report = checkAccount(northwind);
    expect(report.diagnostics).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.scenarios.map((scenario) => [scenario.title, scenario.ok])).toEqual([
      ["warehouse, Local 42, full time", true],
      ["certified driver, drug screen required", true],
      ["office, not represented", true],
      ["union local recorded on day five", true],
      ["Ada returns her union card on day ten", true],
      ["Ben's union card goes overdue", true],
    ]);
    expect(report.coverage.map((item) => [item.decision, item.covered])).toEqual([
      ["warehouse-onboarding :when", true],
      ["warehouse-onboarding › drug-screen-consent :when", true],
      ["union-card-obligation :when", true],
      ["union-card-reminder › when", true],
      ["forklift-follow-up › when", true],
    ]);
  });

  it("treats a missing fact as unknown and names it", () => {
    const { program } = elaborateAccount(northwind);
    const evaluation = evaluatePolicies(program!, new Map<string, string | number>([["job.site-type", "warehouse"], ["placement.weekly-hours", 32]]));
    expect(evaluation.applied).toEqual(["warehouse-onboarding"]);
    expect(evaluation.forms).toEqual(["w4", "site-safety"]);
    expect(evaluation.unknown).toEqual({
      "drug-screen-consent": ["client.requires-drug-screen"],
      "union-card-obligation": ["placement.union-local"],
    });
    const settled = evaluatePolicies(program!, new Map<string, string | number>([["job.site-type", "office"], ["placement.union-local", "none"]]));
    expect(settled.unknown).toEqual({});
  });

  it("lowers rules inline, platform names to snake_case, and build-time arithmetic to a constant", () => {
    const resources = checkAccount(northwind).resources;
    const policy = resources.find((resource) => resource.key === "northwind.union-card-obligation")!;
    expect(policy.spec.rules).toEqual({
      all: [
        { fact: "placement.custom_attributes.union_local", op: "neq", value: "none" },
        { fact: "placement.custom_attributes.weekly_hours", op: "gte", value: 20 },
      ],
    });
    const form = resources.find((resource) => resource.key === "northwind.union-card")!;
    expect(JSON.stringify(form.spec)).toContain("=ROUND([job.custom_attributes.hourly_rate] * [placement.custom_attributes.weekly_hours] * 0.015, 2)");
    expect(form.spec.writes).toEqual(["employee.custom_attributes.union_card_number", "employee.custom_attributes.mailing_address"]);
    expect(resources.find((resource) => resource.key === "employee.custom_attributes.union_card_number")!.spec).toMatchObject({
      scalar_type: "string", is_sensitive_info: true, is_searchable: false, is_permission_scope: false,
    });
  });

  it.each(mistakes.map((mistake) => [mistake.id, mistake] as const))("reports %s as one located error", (_, mistake) => {
    const report = checkAccount(applyMistake(northwind, mistake));
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]!.severity).toBe("error");
    expect(report.diagnostics[0]!.message).toContain(mistake.error);
    expect(report.diagnostics[0]!.loc?.line).toBeGreaterThan(0);
  });

  it("reports parse errors with a location", () => {
    const { program, diagnostics } = elaborateAccount('(account northwind "Northwind"');
    expect(program).toBeUndefined();
    expect(diagnostics[0]?.loc?.line).toBe(1);
  });

  it("quotes the program verbatim in the page's guide and states its current numbers", () => {
    const page = read("apps/site/public/onboarded/index.html");
    const unescape = (text: string) => text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", "\"").replaceAll("&amp;", "&");
    const quoted = [...page.matchAll(/<pre[^>]*data-source[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map((match) => unescape(match[1]!));
    expect(quoted.length).toBeGreaterThanOrEqual(10);
    for (const snippet of quoted) expect(northwind).toContain(snippet);
    const { summary } = buildAccountArtifact(northwind);
    const stat = (name: string) => page.match(new RegExp(`data-stat="${name}">([^<]+)<`))?.[1];
    expect(stat("lines")).toBe(String(summary.lines));
    expect(stat("resources")).toBe(String(summary.resources));
    expect(stat("scenarios")).toBe(String(summary.scenarios.passed));
    expect(stat("decisions")).toBe(`${summary.decisions.covered} / ${summary.decisions.total}`);
  });

  it("keeps the site's account artifact in sync with the program", () => {
    expect(JSON.parse(read("apps/site/public/onboarded/account.json"))).toEqual(buildAccountArtifact(northwind));
  });
});

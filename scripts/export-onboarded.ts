import { readFile, writeFile } from "node:fs/promises";
import { onboarded } from "../examples/onboarded/model.js";
import { permissionProperties, runOnboardedScenario } from "../examples/onboarded/scenario.js";
import { ontologyToIR } from "../src/index.js";

const views = JSON.parse(await readFile(new URL("../apps/site/onboarded-views.json", import.meta.url), "utf8"));
const artifact = { ontology: ontologyToIR(onboarded), scenario: await runOnboardedScenario(), permissionProperties, views };
await writeFile(new URL("../apps/site/public/onboarded/model.json", import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`);
console.log("Exported the illustrative Onboarded model and local runtime transcript");

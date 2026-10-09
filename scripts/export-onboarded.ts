import { writeFile } from "node:fs/promises";
import { onboarded } from "../examples/onboarded/model.js";
import { runOnboardedScenario } from "../examples/onboarded/scenario.js";
import { ontologyToIR } from "../src/index.js";

const artifact = { ontology: ontologyToIR(onboarded), scenario: await runOnboardedScenario() };
await writeFile(new URL("../apps/site/public/onboarded/model.json", import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`);
console.log("Exported the illustrative Onboarded model and local runtime transcript");

import { readFile, writeFile } from "node:fs/promises";
import { accountFile, buildAccountArtifact } from "../examples/onboarded/account/artifact.js";
import { onboarded } from "../examples/onboarded/model.js";
import { runOnboardedScenario } from "../examples/onboarded/scenario.js";
import { ontologyToIR } from "../src/index.js";

const views = JSON.parse(await readFile(new URL("../apps/site/onboarded-views.json", import.meta.url), "utf8"));
const artifact = { ontology: ontologyToIR(onboarded), scenario: await runOnboardedScenario(), views };
await writeFile(new URL("../apps/site/public/onboarded/model.json", import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`);
const account = buildAccountArtifact(await readFile(new URL(`../${accountFile}`, import.meta.url), "utf8"));
await writeFile(new URL("../apps/site/public/onboarded/account.json", import.meta.url), `${JSON.stringify(account, null, 2)}\n`);
console.log("Exported the Onboarded model, local runtime transcript, and Northwind account program");

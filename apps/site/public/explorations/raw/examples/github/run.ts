import { runGitHubScenario } from "./scenario.js";

console.log(JSON.stringify(await runGitHubScenario(), null, 2));

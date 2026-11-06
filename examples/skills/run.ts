import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { elaborateFormaSkillModel } from "../../src/experimental/skills-forma.js";
import { compileSkillArtifacts } from "../../src/experimental/skills.js";

// Explicit output directory: pnpm exec tsx examples/skills/run.ts .context/skills
const output = process.argv[2];
if (!output) throw new TypeError("Usage: pnpm exec tsx examples/skills/run.ts <output-directory>");
const source = await readFile(new URL("./model.lisp", import.meta.url), "utf8");
const model = elaborateFormaSkillModel(source, { name: "skills-field-service", version: "1" });
const artifacts = compileSkillArtifacts(model, "dispatch-work");
const directory = resolve(output);
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, "SKILL.md"), artifacts.skillMarkdown);
await writeFile(resolve(directory, "llms.txt"), artifacts.llmsText);
await writeFile(resolve(directory, "tools.json"), JSON.stringify(artifacts.tools, null, 2) + "\n");
await writeFile(resolve(directory, "model.json"), JSON.stringify(model, null, 2) + "\n");
console.log(`Wrote dispatch-work artifacts to ${directory}`);

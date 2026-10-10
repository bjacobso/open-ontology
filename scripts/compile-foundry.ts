/**
 * Compile a checked ontology to `@osdk/maker` source for Palantir Foundry Ontology as Code.
 * Checker errors stop the compile; Foundry approximations print as warnings on stderr.
 *
 *   pnpm model:foundry <model.lisp | model.ts> [--name <name>] [--version <version>] [--out <file>]
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileOsdkMaker } from "../src/index.js";
import { checkModelFile, type Diagnostic } from "./check-model.js";

const usage =
  "Usage: pnpm model:foundry <model.lisp | model.ts> [--name <name>] [--version <version>] [--out <file>]";

const main = async (args: readonly string[]): Promise<number> => {
  const flags = new Map<string, string>();
  const files: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--name" || arg === "--version" || arg === "--out") {
      const value = args[index + 1];
      if (value === undefined) {
        console.error(usage);
        return 2;
      }
      flags.set(arg.slice(2), value);
      index += 1;
    } else if (arg.startsWith("--")) {
      console.error(`Unknown option ${arg}\n${usage}`);
      return 2;
    } else files.push(arg);
  }
  if (files.length !== 1) {
    console.error(usage);
    return 2;
  }
  const file = files[0]!;
  const name = flags.get("name");
  const version = flags.get("version");
  const checked = await checkModelFile(file, {
    ...(name === undefined ? {} : { name }),
    ...(version === undefined ? {} : { version }),
  });
  const where = (diagnostic: Diagnostic) =>
    diagnostic.line === undefined ? (diagnostic.source ?? file)
      : `${diagnostic.source ?? file}:${diagnostic.line}:${diagnostic.col ?? 1}`;
  const errors = checked.diagnostics.filter(({ severity }) => severity === "error");
  for (const diagnostic of errors) {
    console.error(`${where(diagnostic)}: error: ${diagnostic.message}`);
  }
  if (!checked.ok || !checked.ir) return 1;

  const compiled = compileOsdkMaker(checked.ir);
  for (const { declaration, message } of compiled.diagnostics) {
    console.error(`${file}: warning: ${declaration}: ${message}`);
  }
  const out = flags.get("out");
  if (out === undefined) process.stdout.write(compiled.source);
  else {
    await writeFile(out, compiled.source);
    console.error(`wrote ${out}`);
  }
  return 0;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}

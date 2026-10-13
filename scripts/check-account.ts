import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { checkAccount, formatReport } from "../examples/onboarded/account/check.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const file = args.find((arg) => arg !== "--json");
if (!file) {
  console.error("Usage: pnpm account:check <account.lisp> [--json]");
  process.exit(2);
}
const report = checkAccount(readFileSync(file, "utf8"));
const label = relative(process.cwd(), file);
console.log(json
  ? JSON.stringify({ ok: report.ok, diagnostics: report.diagnostics, resources: report.resources, scenarios: report.scenarios, coverage: report.coverage }, null, 2)
  : formatReport(label, report));
process.exit(report.ok ? 0 : 1);

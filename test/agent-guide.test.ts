import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkFormaSource } from "../scripts/check-model.js";

// The agent guide is the site's primary artifact; agents copy it verbatim, so every claim that can run does.
const guide = readFileSync(new URL("../apps/site/public/llms-full.txt", import.meta.url), "utf8");
const sections = guide.split(/^## /m).slice(1).map((section) => ({
  title: section.slice(0, section.indexOf("\n")),
  body: section,
}));
const blocks = (body: string, language: string): string[] =>
  [...body.matchAll(new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g"))].map(([, code]) => code!);
const section = (prefix: string) => {
  const found = sections.find(({ title }) => title.startsWith(prefix));
  if (!found) throw new Error(`Guide section ${prefix} is missing`);
  return found.body;
};
const tsx = (...args: string[]) =>
  execFileSync("pnpm", ["exec", "tsx", ...args], { encoding: "utf8", cwd: new URL("..", import.meta.url) });

describe("agent guide", () => {
  const withLisp = sections.filter(({ body }) => blocks(body, "lisp").length > 0);

  it.each(withLisp.map(({ title, body }) => [title, body] as const))(
    "section %s builds a clean model block by block",
    (_title, body) => {
      let source = "";
      for (const block of blocks(body, "lisp")) {
        source += `${block}\n`;
        const result = checkFormaSource(source, { name: "guide" });
        expect(result.diagnostics).toEqual([]);
        expect(result.ok).toBe(true);
      }
    },
  );

  it("shows the support-desk model exactly as checked in", () => {
    const model = readFileSync(new URL("../examples/support-desk/model.lisp", import.meta.url), "utf8");
    expect(blocks(section("10."), "lisp")).toEqual([model]);
  });

  it("shows the output the support-desk example really prints", () => {
    const [expected] = blocks(section("10."), "json");
    expect(JSON.parse(tsx("examples/support-desk/run.ts"))).toEqual(JSON.parse(expected!));
  });

  it("shows the output model:check really prints", () => {
    const [transcript] = blocks(section("6."), "text");
    const [command, ...output] = transcript!.trimEnd().split("\n");
    const args = command!.replace(/^\$ pnpm model:check /, "").split(" ");
    expect(tsx("scripts/check-model.ts", ...args).trimEnd()).toBe(output.join("\n"));
  });
});

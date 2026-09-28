import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "public");
const html = readFileSync(join(publicDir, "index.html"), "utf8");
for (const target of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const value = target[1];
  if (value.startsWith("#")) {
    assert.match(html, new RegExp(`id="${value.slice(1)}"`), `Missing anchor ${value}`);
  } else if (value.startsWith("/")) {
    assert.doesNotThrow(() => readFileSync(join(publicDir, value === "/" ? "index.html" : value.slice(1))), `Missing asset ${value}`);
  }
}
assert.match(html, /Local in-memory runtime/, "The site must state the current host limit");
assert.doesNotMatch(html, /href="\/(?:docs|examples|databases|forma)\b/, "Old app routes must not be linked");
console.log("Site assets, anchors, and current scope checked");

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const siteDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(siteDir, "public");
const repoDir = join(siteDir, "..", "..");
const repoUrl = "https://github.com/bjacobso/open-ontology/";

const read = (name) => readFileSync(join(publicDir, name), "utf8");
const pages = { "index.html": read("index.html"), "404.html": read("404.html") };
const texts = { "llms.txt": read("llms.txt"), "llms-full.txt": read("llms-full.txt") };

const checkRepoLink = (source, url) => {
  const path = url.slice(repoUrl.length).replace(/^(?:blob|tree)\/main\//, "").replace(/[#?].*$/, "");
  if (path === "" || path.startsWith("#")) return;
  assert.ok(existsSync(join(repoDir, path)), `${source} links to missing repository path ${path}`);
};

for (const [name, html] of Object.entries(pages)) {
  for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (value.startsWith("#")) {
      assert.match(html, new RegExp(`id="${value.slice(1)}"`), `${name}: missing anchor ${value}`);
    } else if (value.startsWith("/")) {
      assert.ok(existsSync(join(publicDir, value === "/" ? "index.html" : value.slice(1))), `${name}: missing asset ${value}`);
    } else if (value.startsWith(repoUrl)) {
      checkRepoLink(name, value);
    }
  }
}
for (const [name, text] of Object.entries(texts)) {
  for (const [, value] of text.matchAll(/\]\((\/[^)]+)\)/g)) {
    assert.ok(existsSync(join(publicDir, value.slice(1))), `${name}: missing asset ${value}`);
  }
  for (const [url] of text.matchAll(/https:\/\/github\.com\/bjacobso\/open-ontology\/[^\s)]+/g)) {
    checkRepoLink(name, url);
  }
}

const index = pages["index.html"];
assert.match(index, /Local in-memory runtime/, "The site must state the current host limit");
assert.match(index, /href="\/llms-full\.txt"/, "The homepage must link agents to the guide");
assert.match(index, /rel="alternate" type="text\/plain" href="\/llms-full\.txt"/, "The guide must be discoverable from <head>");
assert.doesNotMatch(index, /href="\/(?:docs|examples|databases|forma)\b/, "Old app routes must not be linked");
assert.match(index, /id="community"[\s\S]*href="https:\/\/discord\.gg\/cjW4gxsdXK"/, "The homepage must invite people to the Discord");
assert.match(texts["llms.txt"], /^# Open Ontology\n\n> /, "llms.txt must open with a title and summary");
assert.match(texts["llms-full.txt"], /Current checkpoint: one package, local in-memory runtime/, "The guide must state the current host limit");
console.log("Site assets, anchors, repository links, agent files, and current scope checked");

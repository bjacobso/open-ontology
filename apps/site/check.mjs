import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const siteDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(siteDir, "public");
const repoDir = join(siteDir, "..", "..");
const repoUrl = "https://github.com/bjacobso/open-ontology/";
const rawRepoUrl = "https://raw.githubusercontent.com/bjacobso/open-ontology/main/";
const siteUrl = "https://open-ontology.com";

const read = (name) => readFileSync(join(publicDir, name), "utf8");
const pages = { "index.html": read("index.html"), "404.html": read("404.html") };
const texts = { "llms.txt": read("llms.txt"), "llms-full.txt": read("llms-full.txt") };

const checkRepoLink = (source, url) => {
  const path = url.startsWith(rawRepoUrl)
    ? url.slice(rawRepoUrl.length).replace(/[#?].*$/, "")
    : url.slice(repoUrl.length).replace(/^(?:blob|tree)\/main\//, "").replace(/[#?].*$/, "");
  if (path === "" || path.startsWith("#")) return;
  assert.ok(existsSync(join(repoDir, path)), `${source} links to missing repository path ${path}`);
};

const checkSiteLink = (source, value) => {
  const url = new URL(value, siteUrl);
  if (url.origin !== siteUrl) return;
  const path = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  assert.ok(statSync(join(publicDir, path), { throwIfNoEntry: false })?.isFile(), `${source}: missing asset ${path}`);
};

for (const [name, html] of Object.entries(pages)) {
  for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (value.startsWith("#")) {
      assert.match(html, new RegExp(`id="${value.slice(1)}"`), `${name}: missing anchor ${value}`);
    } else if (value.startsWith("/")) {
      checkSiteLink(name, value);
    } else if (value.startsWith(repoUrl)) {
      checkRepoLink(name, value);
    }
  }
}
for (const [name, text] of Object.entries(texts)) {
  for (const [, value] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    checkSiteLink(name, value);
    if (value.startsWith(rawRepoUrl)) checkRepoLink(name, value);
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
const summary = texts["llms.txt"].split("\n")[2];
assert.match(summary, /experimental/i, "llms.txt summary must state maturity");
assert.match(summary, /pnpm install --frozen-lockfile/, "llms.txt summary must explain setup");
const sections = texts["llms.txt"].split(/^## /m).slice(1);
for (const title of ["Docs", "Examples", "Source", "Community"]) {
  assert.ok(sections.some((section) => section.startsWith(`${title}\n`)), `llms.txt: missing section ${title}`);
}
for (const section of sections) {
  const title = section.split("\n")[0];
  const entries = section.split("\n").slice(1).filter((line) => line.trim() !== "");
  assert.ok(entries.length > 0, `llms.txt: empty section ${title}`);
  for (const entry of entries) {
    assert.match(entry, /^- \[[^\]]+\]\(https:\/\/[^)\s]+\): \S.*$/, `llms.txt: invalid link entry in ${title}`);
  }
}
assert.match(readFileSync(join(siteDir, "wrangler.jsonc"), "utf8"), /"not_found_handling"\s*:\s*"404-page"/, "The site must use a 404 page, not an SPA fallback");
assert.match(texts["llms-full.txt"], /Current checkpoint: one package, local in-memory runtime/, "The guide must state the current host limit");
console.log("Site assets, anchors, repository links, agent files, and current scope checked");

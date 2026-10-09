import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const siteDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(siteDir, "public");
const repoDir = join(siteDir, "..", "..");
const repoUrl = "https://github.com/bjacobso/open-ontology/";
const rawRepoUrl = "https://raw.githubusercontent.com/bjacobso/open-ontology/main/";
const siteUrl = "https://open-ontology.com";

const read = (name) => readFileSync(join(publicDir, name), "utf8");
const htmlFiles = readdirSync(publicDir, { recursive: true }).filter((name) => name.endsWith(".html"));
const pages = Object.fromEntries(htmlFiles.map((name) => [name, read(name)]));
const texts = { "llms.txt": read("llms.txt"), "llms-full.txt": read("llms-full.txt") };

const checkRepoLink = (source, url) => {
  const path = url.startsWith(rawRepoUrl)
    ? url.slice(rawRepoUrl.length).replace(/[#?].*$/, "")
    : url.slice(repoUrl.length).replace(/^(?:blob|tree)\/main\//, "").replace(/[#?].*$/, "");
  if (path === "" || path.startsWith("#")) return;
  assert.ok(existsSync(join(repoDir, path)), `${source} links to missing repository path ${path}`);
};

const checkSiteLink = (source, value) => {
  const url = new URL(value, new URL(source, `${siteUrl}/`));
  if (url.origin !== siteUrl) return;
  const path = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  assert.ok(statSync(join(publicDir, path), { throwIfNoEntry: false })?.isFile(), `${source}: missing asset ${path}`);
  if (url.hash && path.endsWith(".html")) {
    const target = read(path);
    const id = decodeURIComponent(url.hash.slice(1));
    assert.ok(target.includes(`id="${id}"`), `${source}: missing anchor ${value}`);
  }
};

for (const [name, html] of Object.entries(pages)) {
  for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    checkSiteLink(name, value);
    if (value.startsWith(repoUrl) || value.startsWith(rawRepoUrl)) {
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
const catalog = pages["preludes.html"];
assert.ok(catalog, "The prelude catalog must exist");
assert.match(index, /href="\/preludes\.html"/, "The homepage must link to the prelude catalog");
assert.match(texts["llms.txt"], /\]\(https:\/\/open-ontology\.com\/preludes\.html\)/, "The agent index must link to the catalog");
assert.match(catalog, /v0\.2 design sketches/, "The catalog must distinguish future platform sketches");
assert.match(catalog, /local in-memory runtime/, "The catalog must state the current runtime boundary");
const guides = Object.entries(pages).filter(([name]) => name.startsWith("preludes/"));
const documentedSources = [];
for (const [name, html] of guides) {
  const source = html.match(/data-prelude-source="([^"]+)"/)?.[1];
  assert.ok(source, `${name}: missing source inventory entry`);
  documentedSources.push(source);
  assert.ok(existsSync(join(repoDir, source)), `${name}: missing source ${source}`);
  assert.ok(html.includes(`href="${rawRepoUrl}${source}"`), `${name}: missing raw Lisp source link`);
  assert.ok(html.includes(`href="${rawRepoUrl}docs/`), `${name}: missing raw documentation link`);
  assert.ok(catalog.includes(`href="/${name}"`), `Catalog must link to ${name}`);
  assert.ok(texts["llms.txt"].includes(`https://open-ontology.com/${name}`), `Agent index must link to ${name}`);
  for (const id of ["overview", "vocabulary", "example", "availability", "docs"]) {
    assert.ok(html.includes(`id="${id}"`), `${name}: missing ${id} section`);
  }
  const support = source.startsWith("preludes/") && source !== "preludes/ontology.lisp";
  if (support) {
    assert.match(html, /Compiler source excerpt · not a model/, `${name}: excerpts must be labeled`);
    assert.ok(html.includes(`data-source-excerpt="${source}"`), `${name}: missing compiler excerpt`);
    assert.doesNotMatch(html, /data-model-example=/, `${name}: compiler sources must not be presented as models`);
  } else {
    assert.match(html, /data-model-example=/, `${name}: missing checked model example`);
    assert.match(html, /pnpm model:check examples\/my-domain\/model\.lisp/, `${name}: missing model-check instructions`);
  }
}
const actualSources = ["libraries", "preludes"].flatMap((dir) =>
  readdirSync(join(repoDir, dir), { recursive: true })
    .filter((name) => name.endsWith(".lisp"))
    .map((name) => `${dir}/${name}`),
);
assert.deepEqual(documentedSources.sort(), actualSources.sort(), "Every bundled Lisp source must have exactly one guide");
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
for (const title of ["Docs", "Preludes", "Examples", "Source", "Community"]) {
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
console.log("Site assets, anchors, repository links, prelude inventory, agent files, and current scope checked");

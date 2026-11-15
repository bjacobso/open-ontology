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
const pages = Object.fromEntries(readdirSync(publicDir, { recursive: true })
  .filter((name) => name.endsWith(".html"))
  .map((name) => [name, read(name)]));
const texts = { "llms.txt": read("llms.txt"), "llms-full.txt": read("llms-full.txt") };

const checkRepoLink = (source, url) => {
  // PRs, issues and non-main source links describe explorations outside this checkout.
  const remotePath = url.slice(repoUrl.length);
  if (/^(?:pull|issues)\/\d+(?:$|[#?])/.test(remotePath) || /^(?:blob|tree)\/(?!main\/)/.test(remotePath)) return;
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
  const candidates = [path, `${path}.html`, join(path, "index.html")];
  assert.ok(candidates.some((candidate) => statSync(join(publicDir, candidate), { throwIfNoEntry: false })?.isFile()), `${source}: missing asset ${path}`);
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
// WorldVM family contract (worldvm TEMPLATE.md): strip, proof line, sitemap, feed, share image.
const family = JSON.parse(readFileSync(join(repoDir, "rollout", "family.json"), "utf8"));
const visibleText = (html) => html.replace(/<[^>]*>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ");
const strip = index.match(/<section class="oo-family"[\s\S]*?<\/section>/)?.[0] ?? "";
assert.deepEqual(
  [...strip.matchAll(/<a href="([^"]+)">([^<]+)<\/a><p>([^<]+)<\/p><small>([^<]+)<\/small>/g)].map((match) => match.slice(1)),
  family.map((project) => [project.site, project.name, project.pitch, `${project.maturity} · ${project.tier}`]),
  "The homepage family strip must render rollout/family.json in order",
);
assert.match(index, /<\/section>\s*<footer class="oo-footer">/, "The family strip must sit directly above the footer");
assert.match(index, /<footer[\s\S]*href="https:\/\/worldvm\.com">Part of the WorldVM family</, "The footer must link the WorldVM family");
const own = family.find((project) => project.repo === "bjacobso/open-ontology");
assert.equal(visibleText(index).split(own.relationship).length, 2, "The homepage must state the family relationship sentence once");
for (const project of family.filter((entry) => entry.repo !== "bjacobso/open-ontology")) {
  for (const [name, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, new RegExp(`<a\\b[^>]*href="https://github\\.com/${project.repo}(?:[/"])`), `${name}: link ${project.name} through ${project.site}, not GitHub`);
  }
}
const sitemap = read("sitemap.xml");
const sitemapPages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
const listedPages = Object.keys(pages)
  .filter((name) => name.endsWith("index.html") && !name.startsWith("onboarded/") && !name.startsWith("explorations/source/"))
  .map((name) => `${siteUrl}/${name.replace(/index\.html$/, "")}`);
assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/, "sitemap.xml must be a namespaced URL set");
assert.deepEqual([...sitemapPages].sort(), listedPages.sort(), "sitemap.xml must list every public page (unlisted /onboarded and source views excluded)");
assert.match(read("robots.txt"), new RegExp(`^User-agent: \\*[\\s\\S]*Sitemap: ${siteUrl}/sitemap\\.xml$`, "m"), "robots.txt must declare the sitemap");
const feed = read("feed.xml");
const articles = Object.entries(pages).filter(([, html]) => /property="og:type" content="article"/.test(html));
assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/, "feed.xml must be Atom");
assert.equal(feed.match(/<entry>/g)?.length ?? 0, articles.length, "feed.xml needs one entry per published article");
for (const name of ["index.html", ...listedPages.map((url) => url.slice(siteUrl.length + 1) + "index.html")]) {
  assert.match(pages[name], /property="og:image" content="https:\/\/open-ontology\.com\/og\.png"/, `${name}: missing share image`);
}
assert.deepEqual([...readFileSync(join(publicDir, "og.png")).subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "og.png must be a PNG");

assert.match(readFileSync(join(siteDir, "wrangler.jsonc"), "utf8"), /"not_found_handling"\s*:\s*"404-page"/, "The site must use a 404 page, not an SPA fallback");
assert.match(texts["llms-full.txt"], /Current checkpoint: one package, local in-memory runtime/, "The guide must state the current host limit");
console.log("Site assets, anchors, repository links, agent files, and current scope checked");

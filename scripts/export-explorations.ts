import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked, Renderer } from "marked";

export interface CatalogEntry {
  readonly id: string;
  readonly title: string;
  readonly kind: "domain" | "language" | "platform" | "framework";
  readonly status: "runnable" | "sketch" | "review" | "external";
  readonly summary: string;
  readonly readme?: string;
  readonly command?: string;
  readonly test?: string;
  readonly output?: string;
  readonly sources: readonly { readonly path: string; readonly role: string }[];
  readonly links: readonly { readonly title: string; readonly url: string }[];
}
const root = fileURLToPath(new URL("..", import.meta.url));
const destination = resolve(root, "apps/site/public/explorations");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
export const catalog = JSON.parse(read("examples/catalog.json")) as { readonly version: number; readonly entries: readonly CatalogEntry[] };
const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const sourceUrl = (path: string) => `/explorations/source/${path}.html`;
const rawUrl = (path: string) => `/explorations/raw/${path}`;
const entryUrl = (entry: CatalogEntry) => `/explorations/${entry.id}/`;
const labels = { runnable: "Runs locally", sketch: "Design sketch", review: "Open PR", external: "Upstream exploration" };
const readFiles = (entry: CatalogEntry) => [...entry.sources.map((s) => s.path),
  ...(entry.readme ? [entry.readme] : []), ...(entry.output ? [entry.output] : [])];

export const validateCatalog = () => {
  assert.equal(catalog.version, 1);
  const ids = new Set<string>();
  for (const entry of catalog.entries) {
    assert.match(entry.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(!ids.has(entry.id), `Duplicate catalog id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.status in labels, `Unknown status ${entry.status}`);
    assert.ok(["domain", "language", "platform", "framework"].includes(entry.kind));
    for (const path of [...readFiles(entry), ...(entry.test ? [entry.test] : [])]) {
      assert.ok(!posix.isAbsolute(path) && !path.split("/").includes(".."), `Non-repository catalog path ${path}`);
      read(path);
    }
    for (const { url } of entry.links) assert.equal(new URL(url).protocol, "https:");
    if (entry.status === "runnable") {
      assert.ok(entry.readme && entry.command && entry.test, `${entry.id} needs README, command and test`);
      assert.ok(entry.sources.some((s) => s.role === "model"), `${entry.id} needs a model`);
      assert.ok(entry.sources.some((s) => s.role === "runner"), `${entry.id} needs a runner`);
    } else assert.equal(entry.command, undefined, `${entry.id} must not imply local execution`);
    if (entry.command) {
      assert.match(entry.command, /^pnpm [a-z][a-z0-9:-]*$/);
      assert.ok(packageJson.scripts[entry.command.slice(5)], `Missing script ${entry.command}`);
    }
  }
  assert.deepEqual(catalog.entries.filter((e) => e.command).map((e) => e.command!.slice(5)).sort(),
    Object.keys(packageJson.scripts).filter((name) => name === "example" || name.startsWith("example:")).sort(),
    "Every runnable example script needs a catalog entry");
};

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Open Ontology</title><meta name="description" content="Readable, source-linked Open Ontology explorations and local examples.">
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/explorations.css">
<link rel="alternate" type="text/plain" href="/llms.txt" title="Agent index"></head>
<body class="explore"><a class="skip" href="#main">Skip to content</a><header class="explore-nav"><a href="/">Open Ontology</a><nav aria-label="Main navigation"><a href="/explorations/">Explorations</a><a href="/llms-full.txt">Agent guide</a><a href="https://github.com/bjacobso/open-ontology">GitHub ↗</a></nav></header>
<main id="main">${body}</main><footer>Experimental v0.1 · Local in-memory runtime. <a href="/explorations/">All explorations</a></footer></body></html>\n`;

const renderMarkdown = (path: string, sourcePaths: ReadonlySet<string>): string => {
  const renderer = new Renderer();
  renderer.link = function ({ href, tokens }) {
    let target = href;
    if (!/^(?:https?:|#|mailto:)/.test(href)) {
      const [file, anchor] = href.split("#");
      const linked = posix.normalize(posix.join(posix.dirname(path), file!));
      target = sourcePaths.has(linked) && !anchor ? sourceUrl(linked)
        : `https://github.com/bjacobso/open-ontology/blob/main/${linked}${anchor ? `#${anchor}` : ""}`;
    }
    return `<a href="${escape(target)}">${this.parser.parseInline(tokens)}</a>`;
  };
  // The notebook renders repository-authored Markdown; raw HTML is shown as text.
  renderer.html = ({ text }) => escape(text);
  return new Marked({ renderer }).parse(read(path), { async: false });
};

/** The same manifest produces the site, raw sources, and notebook transcripts. */
export const renderExplorations = (execute = true): Map<string, string> => {
  validateCatalog();
  const assets = new Map<string, string>();
  const paths = new Set(catalog.entries.flatMap(readFiles));
  for (const path of paths) {
    assets.set(`raw/${path}`, read(path));
    const language = extname(path).slice(1);
    const lines = read(path).trimEnd().split("\n").map((line, i) =>
      `<span class="source-line" id="L${i + 1}"><a class="line-number" href="#L${i + 1}" aria-label="Line ${i + 1}">${i + 1}</a><code>${escape(line) || " "}</code></span>`).join("\n");
    assets.set(`source/${path}.html`, page(path, `<p class="eyebrow">Full source · ${escape(language)}</p><h1 class="source-title">${escape(path)}</h1>
<p><a href="${rawUrl(path)}">Raw source</a> · <a href="https://github.com/bjacobso/open-ontology/blob/main/${path}">View on GitHub ↗</a></p>
<p>Click a line number to copy its location from your address bar.</p><pre class="source-code" tabindex="0">${lines}</pre>`));
  }
  for (const entry of catalog.entries) {
    const tabs = entry.readme ? '<a href="#readme">Readme</a>' : "";
    const files = entry.sources.map((s) => `<li><span>${escape(s.role)}</span><a href="${sourceUrl(s.path)}#L1">${escape(s.path)}</a><a class="raw-link" href="${rawUrl(s.path)}">raw ↗</a></li>`).join("");
    const links = entry.links.map((link) => `<li><a href="${escape(link.url)}">${escape(link.title)} ↗</a></li>`).join("");
    let output = "";
    if (entry.command && execute) {
      const script = packageJson.scripts[entry.command.slice(5)]!;
      // Runnable catalog scripts are direct tsx entrypoints; never pass arbitrary command text to a shell.
      assert.match(script, /^tsx examples\/[a-z0-9-]+\/run\.ts$/);
      const stdout = execFileSync(resolve(root, "node_modules/.bin/tsx"), [script.slice(4)], { cwd: root, encoding: "utf8" });
      const parsed: unknown = JSON.parse(stdout);
      output = JSON.stringify(parsed, null, 2) + "\n";
      if (entry.output) assert.deepEqual(parsed, JSON.parse(read(entry.output)), `${entry.id} output fixture is stale`);
      assets.set(`${entry.id}/output.json`, output);
    }
    const model = entry.sources.find((s) => s.role === "model");
    assets.set(`${entry.id}/index.html`, page(entry.title, `<a class="back" href="/explorations/">← All explorations</a>
<p class="eyebrow">${escape(entry.kind)} <span class="status ${entry.status}">${labels[entry.status]}</span></p>
<h1>${escape(entry.title)}</h1><p class="lead">${escape(entry.summary)}</p>
<nav class="page-nav" aria-label="Notebook sections">${tabs}<a href="#sources">Sources</a>${entry.command ? '<a href="#run">Run example</a>' : ""}</nav>
<div class="notebook"><aside><p class="eyebrow">In this exploration</p><a href="#sources">Language &amp; source</a>${entry.readme ? '<a href="#readme">Documentation</a>' : ""}${entry.command ? '<a href="#run">Model &amp; results</a>' : ""}<a href="/explorations/#adding">Add an exploration ↗</a></aside><div class="notebook-body">
<section id="sources"><h2>Language &amp; source</h2>${files ? `<ul class="source-list">${files}</ul>` : '<p>No prelude or runnable model ships in this repository for this exploration.</p>'}${links ? `<ul>${links}</ul>` : ""}</section>
${entry.readme ? `<section id="readme" class="markdown"><p class="eyebrow">Documentation <a href="${rawUrl(entry.readme)}">Raw Markdown ↗</a></p>${renderMarkdown(entry.readme, paths)}</section>` : ""}
${entry.command ? `<section id="run"><p class="eyebrow">Executable notebook</p><h2>Run the example</h2><p>Run in a clone with Node 24 and pnpm 10.11.0. Each run starts a fresh in-memory Triplex host.</p>
<pre><code>pnpm install --frozen-lockfile\n${escape(entry.command)}</code></pre>
${model ? `<h3>The model</h3><p><a href="${sourceUrl(model.path)}#L1">Full model with line links</a> · <a href="${rawUrl(model.path)}">Raw</a></p><pre tabindex="0"><code>${escape(read(model.path))}</code></pre>` : ""}
<h3>Checked output</h3><p>This output is regenerated by running the example during site checks. Run the command locally to execute it; this static page does not run code in your browser. <a href="${entryUrl(entry)}output.json">Output as JSON</a></p>
<pre tabindex="0"><code>${escape(output)}</code></pre></section>` : ""}
</div></div>`));
  }
  const cards = catalog.entries.map((entry) => `<article class="exploration-card"><p class="eyebrow">${escape(entry.kind)} <span class="status ${entry.status}">${labels[entry.status]}</span></p><h2><a href="${entryUrl(entry)}">${escape(entry.title)} <span aria-hidden="true">↗</span></a></h2><p>${escape(entry.summary)}</p><a class="card-link" href="${entryUrl(entry)}">${entry.command ? "Read, inspect source & run" : "Read the exploration"} →</a></article>`).join("\n");
  assets.set("index.html", page("Explorations", `<p class="eyebrow">Open Ontology / field notes</p><h1>Read the language.<br>Follow it into a running example.</h1>
<p class="lead">Business domains, platform sketches, and language experiments in one place. Each entry says what exists and where it runs.</p>
<p class="intro-links"><a href="#catalog">Browse ${catalog.entries.length} explorations ↓</a><a href="#adding">Add a domain →</a><a href="/explorations/catalog.json">Machine-readable index ↗</a></p>
<p class="legend"><strong>Runs locally</strong> includes source, documentation, a command and coverage. <strong>Design sketch</strong> is illustrative. <strong>Open PR</strong> is separate work under review. <strong>Upstream exploration</strong> lives in another project.</p>
<section id="catalog" class="catalog-grid" aria-label="Exploration catalog">${cards}</section>
<section id="adding" class="adding markdown"><p class="eyebrow">One convention</p>${renderMarkdown("docs/adding-domains.md", paths)}</section>`));
  assets.set("catalog.json", JSON.stringify(catalog, null, 2) + "\n");
  return assets;
};

export const exportExplorations = (check: boolean) => {
  const assets = renderExplorations();
  if (check) {
    const actual = readdirSync(destination, { recursive: true, withFileTypes: true }).filter((d) => d.isFile())
      .map((d) => posix.relative(destination, posix.join(d.parentPath, d.name))).sort();
    assert.deepEqual(actual, [...assets.keys()].sort(), "Exploration file list is stale; run pnpm site:export-explorations");
    for (const [path, expected] of assets) assert.equal(readFileSync(resolve(destination, path), "utf8"), expected,
      `${path} is stale; run pnpm site:export-explorations`);
    console.log(`Exploration catalog, sources, Markdown and ${catalog.entries.filter((e) => e.command).length} executed notebooks checked`);
  } else {
    rmSync(destination, { recursive: true, force: true });
    for (const [path, source] of assets) {
      mkdirSync(dirname(resolve(destination, path)), { recursive: true });
      writeFileSync(resolve(destination, path), source);
    }
    console.log(`Wrote ${assets.size} exploration assets`);
  }
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) exportExplorations(process.argv.includes("--check"));

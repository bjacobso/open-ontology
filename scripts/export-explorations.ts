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

const kindLabels = { domain: "Domain", language: "Language", platform: "Platform", framework: "Framework" };
const statusClass = { runnable: "today", sketch: "sketch", review: "preview", external: "external" };
const statusNote = {
  runnable: "Source, documentation, a command and tests",
  sketch: "Illustrative design, no command",
  review: "Separate work under review",
  external: "Lives in another project",
};
const lispLike = (path: string) => /\.(?:lisp|forma)$/.test(path);
const status = (entry: CatalogEntry) => `<span class="oo-status oo-status--${statusClass[entry.status]}">${labels[entry.status]}</span>`;
const overline = (index: string, title: string) => `<p class="oo-overline"><span>${index}</span>${title}</p>`;
const crumbs = (...parts: readonly string[]) => `<nav class="ox-crumbs" aria-label="Breadcrumb"><a href="/">Open Ontology</a><span aria-hidden="true">/</span>${parts.join('<span aria-hidden="true">/</span>')}</nav>`;
const fonts = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;family=Instrument+Serif:ital@0;1&amp;family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,800&amp;display=swap";

// The page shell matches the homepage: same fonts, navigation, footer and base styles.
const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f6f5ef">
<title>${escape(title)} · Open Ontology</title><meta name="description" content="Readable, source-linked Open Ontology explorations and local examples.">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="alternate" type="text/plain" href="/llms.txt" title="Agent index">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${fonts}" rel="stylesheet">
<link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/explorations.css"><script defer src="/site.js"></script></head>
<body><div class="oo ox"><a class="oo-skip" href="#main">Skip to content</a>
<header class="oo-nav"><a class="oo-brand" href="/" aria-label="Open Ontology home"><img src="/favicon.svg" width="24" height="24" alt=""><span>Open Ontology</span></a><nav aria-label="Main navigation"><a class="oo-nav__section" href="/#std">Standard library</a><a class="oo-nav__section" href="/#preludes">Preludes</a><a class="oo-nav__section" href="/explorations/" aria-current="page">Explorations</a><a class="oo-nav__guide" href="/llms-full.txt">Agent guide</a><a href="https://github.com/bjacobso/open-ontology">GitHub ↗</a></nav></header>
<main id="main" class="oo-main">${body}</main>
<footer class="oo-footer"><span class="oo-footer__brand"><b>Open Ontology</b> Experimental v0.1 · Local in-memory runtime.</span><nav aria-label="Footer navigation"><a href="/explorations/">All explorations</a><a href="/explorations/catalog.json">catalog.json</a><a href="/llms.txt">llms.txt</a><a href="/llms-full.txt">Agent guide</a><a href="https://github.com/bjacobso/open-ontology">Source ↗</a></nav></footer>
</div></body></html>\n`;

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
  return new Marked({ renderer }).parse(read(path), { async: false })
    .replaceAll("<table>", '<div class="ox-table"><table>').replaceAll("</table>", "</table></div>")
    .replaceAll(/class="language-(?:lisp|forma|clojure)"/g, 'class="lang-lisp"');
};

const panel = (head: string, tag: string, body: string, extra = "") =>
  `<div class="oo-panel${extra}"><div class="oo-panel__head"><span>${head}</span><span>${tag}</span></div><pre tabindex="0">${body}</pre></div>`;

/** The same manifest produces the site, raw sources, and notebook transcripts. */
export const renderExplorations = (execute = true): Map<string, string> => {
  validateCatalog();
  const assets = new Map<string, string>();
  const paths = new Set(catalog.entries.flatMap(readFiles));
  for (const path of paths) {
    assets.set(`raw/${path}`, read(path));
    const language = extname(path).slice(1);
    const code = lispLike(path) ? ' class="lang-lisp"' : "";
    const lines = read(path).trimEnd().split("\n").map((line, i) =>
      `<span class="ox-line" id="L${i + 1}"><a class="ox-line__n" href="#L${i + 1}" aria-label="Line ${i + 1}">${i + 1}</a><code${code}>${escape(line) || " "}</code></span>`).join("\n");
    const lineCount = read(path).trimEnd().split("\n").length;
    assets.set(`source/${path}.html`, page(path, `<section class="ox-hero ox-hero--source">${crumbs('<a href="/explorations/">Explorations</a>', "Source")}
<p class="oo-eyebrow"><span class="oo-pulse" aria-hidden="true"></span> Full source · ${escape(language)} · ${lineCount} lines</p>
<h1 class="oo-pkg ox-path">${escape(path)}</h1>
<div class="oo-actions"><a class="oo-primary" href="${rawUrl(path)}">Raw source <span aria-hidden="true">↗</span></a><a class="oo-secondary" href="https://github.com/bjacobso/open-ontology/blob/main/${path}">View on GitHub <span aria-hidden="true">↗</span></a></div>
<p class="oo-meta"><span>Click a line number to link to that line</span></p></section>
${panel(escape(path), escape(language), lines, " ox-source")}`));
  }
  for (const entry of catalog.entries) {
    const files = entry.sources.map((s) => `<li><span class="ox-role">${escape(s.role)}</span><a class="ox-file" href="${sourceUrl(s.path)}#L1">${escape(s.path)}</a><a class="ox-raw" href="${rawUrl(s.path)}">raw ↗</a></li>`).join("");
    const links = entry.links.map((link) => `<a href="${escape(link.url)}">${escape(link.title)} <span>↗</span></a>`).join("");
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
    const sections: { id: string; title: string; html: string }[] = [];
    sections.push({ id: "sources", title: "Language &amp; source", html: `<div class="oo-head">${overline("", "Language &amp; source")}<h2>${files ? "Every file, line-linked." : "Nothing ships here yet."}</h2><p>${files ? "Each source opens with stable line anchors; raw links serve the exact bytes in this repository." : "No prelude or runnable model ships in this repository for this exploration. Follow the links to where the work lives."}</p></div>
${files ? `<ul class="ox-files">${files}</ul>` : ""}${links ? `<div class="oo-links ox-links">${links}</div>` : ""}` });
    if (entry.readme) sections.push({ id: "readme", title: "Documentation", html: `${overline("", "Documentation")}<article class="ox-prose">${renderMarkdown(entry.readme, paths)}<p class="ox-prose__src"><a href="${sourceUrl(entry.readme)}#L1">${escape(entry.readme)}</a> · <a href="${rawUrl(entry.readme)}">Raw Markdown ↗</a></p></article>` });
    if (entry.command) sections.push({ id: "run", title: "Model &amp; results", html: `<div class="oo-head">${overline("", "Executable notebook")}<h2>Run it, then <em>read what it did.</em></h2><p>Run in a clone with Node 24 and pnpm 10.11.0. Each run starts a fresh in-memory Triplex host. This static page does not run code in your browser; the output below is regenerated by running the example during site checks.</p></div>
<div class="ox-run">${model ? panel(`<a href="${sourceUrl(model.path)}#L1">${escape(model.path)}</a>`, "model", `<code${lispLike(model.path) ? ' class="lang-lisp"' : ""}>${escape(read(model.path))}</code>`) : ""}
${panel(`<a href="${entryUrl(entry)}output.json">output.json</a>`, escape(entry.command), `<code>${escape(output)}</code>`, " oo-panel--out")}</div>` });
    const numbered = sections.map((s, i) => ({ ...s, index: String(i + 1).padStart(2, "0") }));
    const body = numbered.map((s) => `<section id="${s.id}" class="oo-section ox-section">${s.html.replace('<p class="oo-overline"><span></span>', `<p class="oo-overline"><span>${s.index}</span>`)}</section>`).join("\n");
    const toc = numbered.map((s) => `<a href="#${s.id}"><span>${s.index}</span>${s.title}</a>`).join("");
    const side = entry.command
      ? `<figure class="oo-hero__side"><div class="oo-repl"><div class="oo-repl__bar" aria-hidden="true"><span></span><span></span><span></span><b>open-ontology</b><em>runs locally</em></div><pre class="ox-cmd"><code><span class="oo-prompt">$</span> pnpm install --frozen-lockfile\n<span class="oo-prompt">$</span> ${escape(entry.command)}\n<span class="oo-dim">${entry.test ? `# covered by ${escape(entry.test)}` : ""}</span></code></pre></div><figcaption class="oo-hero__note">↑ the exact command · <a href="#run">checked output</a></figcaption></figure>`
      : "";
    assets.set(`${entry.id}/index.html`, page(entry.title, `<section class="oo-hero ox-hero${side ? "" : " ox-hero--solo"}"><div class="oo-hero__copy">${crumbs('<a href="/explorations/">Explorations</a>', `<strong>${escape(entry.title)}</strong>`)}
<p class="oo-eyebrow"><span class="oo-pulse" aria-hidden="true"></span> ${kindLabels[entry.kind]} · ${labels[entry.status]}</p>
<h1>${escape(entry.title)}</h1><p class="oo-lead">${escape(entry.summary)}</p>
<div class="oo-actions">${entry.command ? '<a class="oo-primary" href="#run">Run the example <span aria-hidden="true">↓</span></a>' : entry.readme ? '<a class="oo-primary" href="#readme">Read the documentation <span aria-hidden="true">↓</span></a>' : '<a class="oo-primary" href="#sources">Where it lives <span aria-hidden="true">↓</span></a>'}${entry.command || entry.readme ? '<a class="oo-secondary" href="#sources">Sources <span aria-hidden="true">↓</span></a>' : ""}</div>
<p class="oo-meta">${status(entry)}${entry.test ? `<a href="https://github.com/bjacobso/open-ontology/blob/main/${entry.test}">${escape(entry.test)} ↗</a>` : ""}${entry.command ? `<a href="${entryUrl(entry)}output.json">output.json</a>` : ""}</p></div>${side}</section>
<div class="ox-notebook"><aside><p class="ox-aside__label">In this exploration</p><nav aria-label="Notebook sections">${toc}<a href="/explorations/#adding"><span>+</span>Add an exploration</a></nav></aside><div class="ox-notebook__body">${body}</div></div>`));
  }
  const count = (s: CatalogEntry["status"]) => catalog.entries.filter((e) => e.status === s).length;
  const icons = { runnable: "▶", sketch: "~", review: "PR", external: "↗" };
  const strip = (Object.keys(labels) as CatalogEntry["status"][]).map((s) => `<div><i aria-hidden="true">${icons[s]}</i><span>${count(s)} ${count(s) === 1 ? "entry" : "entries"}</span><strong>${labels[s]}</strong><small>${statusNote[s]}</small></div>`).join("");
  const cards = catalog.entries.map((entry) => {
    const roles = [...new Set(entry.sources.map((s) => s.role))];
    return `<article class="oo-card ox-card ox-card--${entry.kind}"><p class="ox-card__kind">${kindLabels[entry.kind]}</p><h3 class="oo-card__title"><a href="${entryUrl(entry)}">${escape(entry.title)}</a></h3><p class="oo-card__story">${escape(entry.summary)}</p>${roles.length ? `<ul class="oo-uses">${roles.map((r) => `<li>${escape(r)}</li>`).join("")}</ul>` : ""}${entry.command ? `<code class="oo-install">${escape(entry.command)}</code>` : ""}<div class="ox-card__foot">${status(entry)}<span aria-hidden="true">→</span></div></article>`;
  }).join("\n");
  assets.set("index.html", page("Explorations", `<section class="oo-hero ox-hero ox-hero--solo"><div class="oo-hero__copy"><p class="oo-eyebrow"><span class="oo-pulse" aria-hidden="true"></span> Open Ontology · Explorations</p><h1>Read the language. <em>Follow it into a running example.</em></h1>
<p class="oo-lead">Business domains, platform sketches, and language experiments in one place. Each entry says what exists and where it runs: source with line links, rendered documentation, and checked output.</p>
<div class="oo-actions"><a class="oo-primary" href="#catalog">Browse ${catalog.entries.length} explorations <span aria-hidden="true">↓</span></a><a class="oo-secondary" href="#adding">Add a domain <span aria-hidden="true">↓</span></a></div>
<p class="oo-meta"><a href="/explorations/catalog.json">catalog.json</a><a href="/llms-full.txt">Agent guide</a><a href="https://github.com/bjacobso/open-ontology/blob/main/examples/catalog.json">Source ↗</a></p></div></section>
<section class="oo-strip" aria-label="Exploration statuses">${strip}</section>
<section id="catalog" class="oo-section" aria-labelledby="catalog-title"><div class="oo-head">${overline("01", "The catalog")}<h2 id="catalog-title">Every domain, language and platform, <em>in one index.</em></h2><p>Runnable entries ship a model, a runner and a test in this repository. Sketches, open PRs and upstream work link to where they live; nothing here implies an integration that does not exist.</p></div>
<div class="oo-cards ox-cards">${cards}</div></section>
<section id="adding" class="oo-section" aria-labelledby="adding-title"><div class="oo-head">${overline("02", "One convention")}<h2 id="adding-title">Add a domain the same way every time.</h2><p>One catalog entry drives this page, the per-example notebook, raw sources and the JSON index for agents. An entry can begin as a sketch and become runnable without changing its id or URL.</p></div>
<article class="ox-prose">${renderMarkdown("docs/adding-domains.md", paths)}</article></section>`));
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

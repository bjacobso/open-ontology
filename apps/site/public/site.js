// Progressive enhancement only: every word on the page is present without JavaScript.

const escape = (text) => text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);

// Declaration forms across the flavors shown on the homepage.
const FORMS = new Set([
  "define-entity", "define-relation", "define-action", "define-mutation", "define-datalog-query",
  "object-type", "link-type", "query", "form", "import", "export", "define",
  "value-type", "interface", "implements",
  "object", "field", "validation-rule", "record-flow", "profile",
  "product", "price", "meter",
  "group", "app-assignment", "team", "repo", "schedule", "escalation",
]);
const OPERATIONS = new Set([
  "changes", "create", "set", "clear", "link", "now",
  "do!", "update!", "link!", "create!", "picklist-of", "members", "blank?", "and",
]);
const TOKEN = /(;[^\n]*)|("(?:[^"\\]|\\.)*")|(:[A-Za-z][\w/-]*)|(-?\b\d[\d_]*\b)|([A-Za-z][\w-]*[!?]?)/g;

function highlightLisp(source) {
  let html = "";
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    html += escape(source.slice(last, match.index));
    const [token, comment, string, keyword, number, word] = match;
    const kind = comment ? "com"
      : string ? (/^"\?/.test(string) ? "var" : "str")
      : keyword ? "kw"
      : number ? "num"
      : word && FORMS.has(word) ? "form"
      : word && OPERATIONS.has(word) ? "op"
      : null;
    html += kind ? `<span class="t-${kind}">${escape(token)}</span>` : escape(token);
    last = match.index + token.length;
  }
  return html + escape(source.slice(last));
}

for (const block of document.querySelectorAll("code.lang-lisp")) {
  block.innerHTML = highlightLisp(block.textContent);
}

async function copy(button, text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  const label = button.textContent;
  button.textContent = "Copied";
  button.dataset.copied = "";
  setTimeout(() => {
    button.textContent = label;
    delete button.dataset.copied;
  }, 1600);
}

if (navigator.clipboard) {
  for (const button of document.querySelectorAll(".oo-copy")) {
    button.hidden = false;
    button.addEventListener("click", () => {
      const text = button.dataset.copyUrl
        ? new URL(button.dataset.copyUrl, location.href).href
        : button.previousElementSibling?.textContent ?? "";
      copy(button, text);
    });
  }
}

if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const targets = document.querySelectorAll(".oo-strip, .oo-section > *, .oo-spread, .oo-community, .oo-family__inner");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const target of targets) {
    if (target.getBoundingClientRect().top > innerHeight) {
      target.classList.add("oo-reveal");
      observer.observe(target);
    }
  }
  document.querySelector(".oo").classList.add("oo-js");
}

// Rosetta stone: hovering or focusing a cell highlights that flavor's column.
const rosetta = document.querySelector(".oo-rosetta");
if (rosetta) {
  const mark = (col) => {
    for (const cell of rosetta.querySelectorAll("[data-col]")) {
      cell.classList.toggle("is-col", cell.dataset.col === col);
    }
  };
  for (const type of ["mouseover", "focusin"]) {
    rosetta.addEventListener(type, (event) => mark(event.target.closest("[data-col]")?.dataset.col));
  }
  rosetta.addEventListener("mouseleave", () => mark(undefined));
}

// Lowering stages become tabs; without JavaScript every stage stays visible.
for (const stages of document.querySelectorAll("[data-stages]")) {
  const rail = stages.querySelector("[role=tablist]");
  const tabs = [...rail.querySelectorAll("[role=tab]")];
  const panels = [...stages.querySelectorAll("[data-stage-panel]")];
  const select = (index) => {
    tabs.forEach((tab, i) => tab.setAttribute("aria-selected", String(i === index)));
    panels.forEach((panel, i) => panel.classList.toggle("is-active", i === index));
  };
  tabs.forEach((tab, i) => tab.addEventListener("click", () => select(i)));
  rail.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = (tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true") + step + tabs.length) % tabs.length;
    select(next);
    tabs[next].focus();
  });
  rail.hidden = false;
  stages.dataset.ready = "";
  select(0);
}

// The hero terminal types its commands once; output lines appear whole.
const typer = document.querySelector(".oo-typer");
if (typer && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const lines = [...typer.querySelectorAll(".oo-line")];
  const commands = new Map(lines.filter((line) => "cmd" in line.dataset).map((line) => [line, line.innerHTML]));
  typer.dataset.typing = "";
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const play = async () => {
    for (const line of lines) {
      if (!commands.has(line)) {
        line.classList.add("is-shown");
        await wait(110);
        continue;
      }
      const prompt = line.querySelector(".oo-prompt").outerHTML;
      const text = line.textContent.replace(/^\$/, "");
      line.classList.add("is-shown", "oo-caret");
      for (let i = 0; i <= text.length; i++) {
        line.innerHTML = prompt + escape(text.slice(0, i));
        await wait(24);
      }
      await wait(380);
      line.classList.remove("oo-caret");
      line.innerHTML = commands.get(line);
    }
    lines.at(-1).classList.add("oo-caret");
  };
  setTimeout(play, 500);
}

const $ = (selector) => document.querySelector(selector);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label, attributes = {}) => {
  const node = make("button", "", label);
  node.type = "button";
  Object.assign(node.dataset, attributes);
  return node;
};
const press = (selector, attribute, value) => {
  for (const node of document.querySelectorAll(selector)) node.setAttribute("aria-pressed", String(node.dataset[attribute] === value));
};

const verbs = [
  { verb: "account", grammar: "(account name \"Title\" :languages [...] :sender \"…\" :support \"…\" :dedupe [paths])",
    about: "The account’s identity and settings. Its name is the namespace for every key below." },
  { verb: "attributes", grammar: "(attributes entity (name type \"Label\" :searchable :sensitive :scope) ...)",
    about: "Typed custom attributes on built-in entities. Choices are closed; :scope marks what access rules may read; sensitive attributes can be neither searchable nor scoped." },
  { verb: "rule", also: ["def"], grammar: "(rule name expression)   (def name arithmetic)",
    about: "Named three-valued predicates, reused by policies, forms, automations, and access. A missing fact is unknown, not false. def folds arithmetic at build time." },
  { verb: "form", grammar: "(form name \"Title\" :due-in days (page \"Title\" :employee field...) ...)",
    about: "Fields bind an attribute or a form answer; reads and writes are inferred. :from references a form another package owns." },
  { verb: "policy", grammar: "(policy name \"Title\" :when rule :require [form (form :when rule)])",
    about: "When a placement matches, require forms. Policies may read placement, employee, employer, client, and job facts." },
  { verb: "automation", also: ["param"], grammar: "(automation name \"Title\" :on trigger (wait …) (when rule step...) (email …) (assign form))",
    about: "A trigger, then steps. Each trigger limits the facts its steps may read; a template is a parameter each target supplies." },
  { verb: "group", grammar: "(group name \"Title\" :can [permissions] :sees rule)",
    about: "Permissions plus an access rule that may read only :scope attributes." },
  { verb: "integration", grammar: "(integration name \"provider@revision\" :connection \"ref\" :setting value ...)",
    about: "Pin a provider revision and name a connection reference. Credentials stay with the target account." },
  { verb: "scenario", grammar: "(scenario \"Title\" {facts} (expect …) (day n (record …) (complete …) (expect …)))",
    about: "Facts in, outcomes out. Scenarios run on every check, and every decision must be seen both true and false." },
];

const tokens = /(;.*$)|("(?:\\.|[^"\\])*")|(:[^\s()[\]{}"]+)|((?<=\()[^\s()[\]{}"]+)|(\b(?:true|false)\b)|(-?\b\d+(?:\.\d+)?\b)|([a-z][\w-]*\.[\w.-]+)/g;
const tokenKinds = ["comment", "string", "keyword", "head", "literal", "literal", "path"];

function highlight(text, into) {
  let last = 0;
  for (const match of text.matchAll(tokens)) {
    if (match.index > last) into.append(text.slice(last, match.index));
    into.append(make("span", `tk-${tokenKinds[match.slice(1).findIndex((group) => group !== undefined)]}`, match[0]));
    last = match.index + match[0].length;
  }
  if (last < text.length) into.append(text.slice(last));
}

function line(number, text, kind, { lisp = true } = {}) {
  const row = make("span", `ob-line${kind ? ` ob-line--${kind}` : ""}`);
  row.append(make("span", "ob-ln", number === undefined ? "" : String(number)));
  const content = make("span", "ob-lc");
  if (lisp) highlight(text, content);
  else content.textContent = text;
  row.append(content);
  return row;
}

async function loadAccount() {
  const response = await fetch("/onboarded/account.json");
  if (!response.ok) throw new Error(`Account returned HTTP ${response.status}`);
  const account = await response.json();
  const sourceLines = account.source.split("\n");

  $("#check-output").replaceChildren(make("span", "tk-prompt", "$ "), `${account.command}\n`, ...account.output.split("\n").map((text) => {
    const row = make("span", text.includes("✗") || text.includes("error") ? "tk-error" : text.includes("✓") || text.endsWith(": ok") ? "tk-ok" : "", text);
    return [row, "\n"];
  }).flat());

  // 01 · Language tour
  function showVerb(entry) {
    press("#verbs button", "verb", entry.verb);
    const declarations = account.declarations.filter((item) => item.verb === entry.verb || entry.also?.includes(item.verb));
    const grammar = make("code", "ob-grammar");
    highlight(entry.grammar, grammar);
    $("#verb-head").replaceChildren(grammar, make("p", "", entry.about));
    const code = $("#verb-source");
    code.replaceChildren();
    declarations.forEach((item, i) => {
      if (i > 0) code.append(line(undefined, "", "gap"));
      for (let number = item.startLine; number <= item.endLine; number++) code.append(line(number, sourceLines[number - 1]));
    });
    const resources = declarations.flatMap((item) => item.resources);
    const ranges = declarations.map((item) => item.startLine === item.endLine ? `${item.startLine}` : `${item.startLine}–${item.endLine}`);
    $("#source-label").textContent = `northwind.account.lisp · line${ranges.length > 1 || ranges[0].includes("–") ? "s" : ""} ${ranges.join(", ")}`;
    $("#resource-label").textContent = resources.length
      ? `${resources.length} resource${resources.length === 1 ? "" : "s"} · ${[...new Set(resources.map((item) => item.kind))].join(", ")}`
      : "No resources · inlined where used";
    $("#verb-resources").textContent = resources.length
      ? JSON.stringify(resources.length === 1 ? resources[0] : resources, null, 2)
      : "// Rules and defs produce no resources of their own.\n// Each use inlines the rule, so the platform stores it where it is read.";
  }
  for (const entry of verbs) {
    const count = account.declarations.filter((item) => item.verb === entry.verb || entry.also?.includes(item.verb)).length;
    const node = button("", { verb: entry.verb });
    node.append(make("span", "", entry.verb), make("small", "", String(count)));
    node.addEventListener("click", () => showVerb(entry));
    $("#verbs").append(node);
  }
  showVerb(verbs.find((entry) => entry.verb === "policy"));
  $("#tour").hidden = false;

  // 02 · Checks
  function showMistake(mistake) {
    press("#mistakes button", "mistake", mistake.id);
    $("#mistake-copy").replaceChildren(make("h3", "", mistake.title), make("p", "", mistake.why));
    const diff = $("#mistake-diff");
    diff.replaceChildren(
      ...mistake.diff.removed.map((text, i) => line(mistake.diff.line + i, text, "removed")),
      ...mistake.diff.added.map((text, i) => line(mistake.diff.line + i, text, "added")),
    );
    $("#mistake-diff-label").textContent = mistake.diff.added.length ? `Edit at line ${mistake.diff.line}` : `Remove lines ${mistake.diff.line}–${mistake.diff.line + mistake.diff.removed.length - 1}`;
    const output = $("#mistake-output");
    output.replaceChildren(...mistake.output.map((text) => line(undefined, text, "message", { lisp: false })), line(undefined, "", "gap"));
    mistake.excerpt.lines.forEach((text, i) => {
      const number = mistake.excerpt.startLine + i;
      output.append(line(number, text, number === mistake.caret.line ? "error" : undefined));
      if (number === mistake.caret.line) {
        const width = Math.max(1, Math.min(mistake.caret.length, text.length - mistake.caret.col + 1));
        output.append(line(undefined, `${" ".repeat(mistake.caret.col - 1)}${"^".repeat(width)}`, "caret", { lisp: false }));
      }
    });
  }
  account.mistakes.forEach((mistake, i) => {
    const node = button("", { mistake: mistake.id });
    node.append(make("span", "", String(i + 1).padStart(2, "0")), make("strong", "", mistake.title));
    node.addEventListener("click", () => showMistake(mistake));
    $("#mistakes").append(node);
  });
  showMistake(account.mistakes[0]);
  $("#checks-panel").hidden = false;

  // 03 · Three-state simulator
  const { simulator } = account;
  const defaults = { "job.site-type": "warehouse", "placement.union-local": "", "placement.weekly-hours": "32", "client.requires-drug-screen": "" };
  for (const fact of simulator.facts) {
    const label = make("label", "", fact.label);
    label.append(make("code", "", fact.path));
    const select = make("select");
    select.dataset.path = fact.path;
    select.append(Object.assign(make("option", "", "Not recorded"), { value: "" }));
    for (const option of fact.options) select.append(Object.assign(make("option", "", option.label), { value: option.value }));
    select.value = defaults[fact.path] ?? "";
    label.append(select);
    $("#sim-form").append(label);
  }
  const verdict = (value) => value === true ? ["applies", "yes"] : value === false ? ["does not apply", "no"] : ["unknown", "unknown"];
  function simulate() {
    const key = simulator.facts.map((fact) => $(`#sim-form select[data-path="${fact.path}"]`).value).join("|");
    const outcome = simulator.outcomes[key];
    const result = $("#sim-result");
    result.replaceChildren();
    for (const policy of outcome.policies) {
      const meta = simulator.policies.find((item) => item.name === policy.policy);
      const [text, state] = verdict(policy.value);
      const card = make("article", "ob-policy");
      card.dataset.state = state;
      const head = make("div", "ob-policy-head");
      const title = make("div");
      title.append(make("strong", "", meta.title), make("code", "", policy.policy));
      head.append(title, make("span", "ob-verdict", text));
      card.append(head);
      if (policy.value === "unknown") card.append(make("p", "ob-waiting", `Waiting for ${policy.missing.join(", ")}`));
      if (policy.forms.length) {
        const list = make("ul", "ob-policy-forms");
        for (const form of policy.forms) {
          const item = make("li");
          item.dataset.state = form.value === true ? "yes" : form.value === false ? "no" : "unknown";
          item.append(make("code", "", form.form), make("span", "", form.value === true ? "required" : form.value === false ? "not required" : `unknown · waiting for ${form.missing.join(", ")}`));
          list.append(item);
        }
        card.append(list);
      } else if (policy.value === false) {
        card.append(make("p", "ob-waiting", "Its forms are not evaluated."));
      }
      result.append(card);
    }
    const summary = make("div", "ob-sim-summary");
    const required = make("p");
    required.append(make("span", "ob-label", "Required now"), ...(outcome.forms.length ? outcome.forms.map((form) => make("code", "", form)) : [make("span", "ob-none", "No forms")]));
    const pending = Object.keys(outcome.unknown);
    const waiting = make("p");
    waiting.append(make("span", "ob-label", "Undecided"), ...(pending.length ? pending.map((name) => make("code", "", name)) : [make("span", "ob-none", "Nothing")]));
    summary.append(required, waiting);
    result.append(summary);
  }
  $("#sim-form").addEventListener("change", simulate);
  $("#sim-form").addEventListener("submit", (event) => event.preventDefault());
  simulate();
  $("#simulator-panel").hidden = false;

  // 04 · Scenarios and coverage
  function showScenario(scenario) {
    press("#scenario-list button", "scenario", scenario.title);
    const timeline = $("#timeline");
    timeline.replaceChildren();
    const days = [...new Set(scenario.timeline.map((event) => event.day))];
    for (const day of days) {
      const item = make("li", "ob-day");
      item.append(make("span", "ob-day-label", `Day ${day}`));
      const events = make("ul");
      for (const event of scenario.timeline.filter((entry) => entry.day === day)) {
        const row = make("li", "ob-event");
        row.dataset.kind = event.kind;
        if (event.ok !== undefined) row.dataset.ok = String(event.ok);
        row.append(make("span", "ob-event-kind", event.kind), make("strong", "", event.text));
        for (const detail of event.detail ?? []) row.append(make("small", "", detail));
        events.append(row);
      }
      item.append(events);
      timeline.append(item);
    }
  }
  for (const scenario of account.scenarios) {
    const node = button("", { scenario: scenario.title });
    node.append(make("span", scenario.ok ? "ob-pass" : "ob-fail", scenario.ok ? "✓" : "✗"), make("strong", "", scenario.title), make("small", "", `line ${scenario.line}`));
    node.addEventListener("click", () => showScenario(scenario));
    $("#scenario-list").append(node);
  }
  showScenario(account.scenarios.find((scenario) => scenario.title.startsWith("Ben")) ?? account.scenarios[0]);
  $("#scenarios-panel").hidden = false;
  for (const item of account.coverage) {
    const row = make("tr");
    const decision = make("th", "", "");
    decision.scope = "row";
    decision.append(make("code", "", item.decision), make("small", "", `line ${item.line}`));
    row.append(decision);
    for (const outcome of ["true", "false", "unknown"]) {
      const cell = make("td", item.seen[outcome].length ? "ob-seen" : "", String(item.seen[outcome].length));
      cell.title = item.seen[outcome].join("\n");
      row.append(cell);
    }
    $("#coverage").append(row);
  }
  $("#coverage-panel").hidden = false;
  $("#account-load-status").hidden = true;
}

loadAccount().catch(() => {
  $("#account-load-status").replaceChildren(
    document.createTextNode("The account program could not load. "),
    Object.assign(make("a", "", "Open the recorded program and results ↗"), { href: "/onboarded/account.json" }),
    document.createTextNode(" or reload to try again."),
  );
});

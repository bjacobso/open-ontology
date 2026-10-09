const $ = (selector) => document.querySelector(selector);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const positions = {
  Account: [125, 65], Membership: [475, 65],
  Employee: [125, 210], Onboarding: [300, 210], Reviewer: [475, 210],
  Document: [300, 355],
};
const accountTypes = new Set(["Account", "Membership", "Reviewer"]);
const groups = [
  ["Objects", "objectTypes", "◇"], ["Links", "linkTypes", "↗"],
  ["Actions", "actionTypes", "λ"], ["Queries", "queryTypes", "?"],
];

async function loadExplorer() {
  const response = await fetch("/onboarded/model.json");
  if (!response.ok) throw new Error(`Model returned HTTP ${response.status}`);
  const { ontology, scenario } = await response.json();
  const declarations = groups.flatMap(([, key]) => ontology[key]);
  const byName = new Map(declarations.map((item) => [item.name, item]));
  const edges = [
    ...ontology.objectTypes.flatMap((item) => item.properties
      .filter((property) => property.valueType.kind === "ref")
      .map((property) => ({ from: item.name, to: property.valueType.target, name: property.name }))),
    ...ontology.linkTypes.map((item) => ({ from: item.from, to: item.to, name: item.name })),
  ];
  let selected = "Onboarding";
  let showIR = false;

  function select(name) {
    if (!byName.has(name)) return;
    selected = name;
    for (const button of document.querySelectorAll("[data-select]")) {
      button.setAttribute("aria-pressed", String(button.dataset.select === name));
    }
    const neighbors = new Set(edges.filter((edge) => edge.from === name || edge.to === name)
      .flatMap((edge) => [edge.from, edge.to]));
    for (const node of document.querySelectorAll(".ob-node")) {
      node.classList.toggle("is-neighbor", neighbors.has(node.dataset.select) && node.dataset.select !== name);
    }
    for (const edge of document.querySelectorAll(".ob-edge")) {
      edge.classList.toggle("is-connected", edge.dataset.from === name || edge.dataset.to === name || edge.dataset.name === name);
    }
    renderInspector();
  }

  function renderList() {
    const list = $("#declaration-list");
    const search = $("#model-search").value.trim().toLowerCase();
    list.replaceChildren();
    let count = 0;
    for (const [title, key, icon] of groups) {
      const items = ontology[key].filter((item) =>
        `${item.name} ${item.description ?? ""}`.toLowerCase().includes(search));
      if (!items.length) continue;
      count += items.length;
      const group = make("div", "ob-list-group");
      const heading = make("div", "ob-list-title");
      heading.append(make("span", "", title), make("span", "", String(items.length)));
      group.append(heading);
      for (const item of items) {
        const button = make("button");
        button.type = "button";
        button.dataset.select = item.name;
        button.setAttribute("aria-pressed", String(selected === item.name));
        const symbol = make("span", "ob-list-icon", icon);
        symbol.setAttribute("aria-hidden", "true");
        button.append(symbol, make("span", "", item.name));
        group.append(button);
      }
      list.append(group);
    }
    if (!count) list.append(make("p", "ob-empty", "No matching declarations. Try another name."));
    $("#search-count").textContent = `${count} matching declarations`;
  }

  function renderGraph() {
    const namespace = "http://www.w3.org/2000/svg";
    for (const edge of edges) {
      const [fromX, fromY] = positions[edge.from];
      const [toX, toY] = positions[edge.to];
      const horizontal = fromY === toY;
      const offsetX = horizontal ? Math.sign(toX - fromX) * 78 : 0;
      const offsetY = horizontal ? 0 : Math.sign(toY - fromY) * 34;
      const group = document.createElementNS(namespace, "g");
      group.classList.add("ob-edge");
      Object.assign(group.dataset, edge);
      const path = document.createElementNS(namespace, "path");
      path.setAttribute("d", `M${fromX + offsetX} ${fromY + offsetY} L${toX - offsetX} ${toY - offsetY}`);
      const label = document.createElementNS(namespace, "text");
      label.setAttribute("x", String((fromX + toX) / 2 + (horizontal ? 0 : 8)));
      label.setAttribute("y", String((fromY + toY) / 2 - (horizontal ? (fromY === 210 ? 44 : 10) : 0)));
      label.setAttribute("text-anchor", horizontal ? "middle" : "start");
      label.textContent = edge.name;
      group.append(path, label);
      $("#edges").append(group);
    }
    for (const item of ontology.objectTypes) {
      const [x, y] = positions[item.name];
      const button = make("button", "ob-node");
      button.type = "button";
      button.dataset.select = item.name;
      button.dataset.layer = accountTypes.has(item.name) ? "account" : "workflow";
      button.style.left = `${x / 6}%`;
      button.style.top = `${y / 4.2}%`;
      button.setAttribute("aria-label", `Inspect ${item.name}, ${item.properties.length} properties`);
      button.append(make("strong", "", item.name), make("span", "", `${item.properties.length} ${item.properties.length === 1 ? "property" : "properties"}`));
      $("#graph-nodes").append(button);
    }
    $("#model-counts").textContent = `${ontology.objectTypes.length} objects · ${edges.length} connections`;
  }

  function propertyRows(properties) {
    for (const property of properties) {
      const row = make("div", "ob-property");
      const heading = make("div", "ob-property-head");
      const type = property.valueType.kind === "ref" ? `→ ${property.valueType.target}` : property.valueType.kind;
      heading.append(make("strong", "", property.name), make("span", "", type));
      row.append(heading);
      const qualifiers = [property.key, property.required ? "required" : "optional", property.cardinality === "many" ? "many" : "one"];
      if (property.unique) qualifiers.push("unique");
      row.append(make("small", "", qualifiers.filter(Boolean).join(" · ")));
      $("#inspector-body").append(row);
    }
  }

  function jsonBlock(value) {
    const pre = make("pre");
    pre.append(make("code", "", JSON.stringify(value, null, 2)));
    return pre;
  }

  function renderInspector() {
    const item = byName.get(selected);
    const heading = $("#inspector-heading");
    heading.replaceChildren(make("h3", "", item.name), make("span", "ob-kind", item.kind), make("p", "", item.description));
    const body = $("#inspector-body");
    body.replaceChildren();
    if (showIR) {
      body.append(jsonBlock(item));
      return;
    }
    if (item.kind === "object-type" || item.kind === "link-type") {
      if (item.kind === "link-type") body.append(make("p", "", `${item.from} → ${item.to}`));
      body.append(make("span", "ob-label", "Properties"));
      propertyRows(item.properties);
      const related = edges.filter((edge) => edge.from === item.name || edge.to === item.name || edge.name === item.name);
      if (related.length) {
        body.append(make("span", "ob-label", "Connected objects"));
        const links = make("div", "ob-related");
        for (const name of new Set(related.flatMap((edge) => [edge.from, edge.to]).filter((name) => name !== item.name))) {
          const button = make("button", "", name);
          button.type = "button";
          button.dataset.select = name;
          links.append(button);
        }
        body.append(links);
      }
    } else if (item.kind === "action-type") {
      body.append(make("span", "ob-label", "Inputs"));
      propertyRows(item.input.map((input) => ({ ...input, required: !input.optional, cardinality: input.cardinality ?? "one" })));
      body.append(make("span", "ob-label", "Changes"), jsonBlock(item.changes));
    } else {
      body.append(make("span", "ob-label", "Datalog query"), jsonBlock(item.query));
    }
  }

  $("#workspace").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-select]");
    if (button) select(button.dataset.select);
  });
  $("#model-search").addEventListener("input", renderList);
  for (const [id, value] of [["#definition-button", false], ["#ir-button", true]]) {
    $(id).addEventListener("click", () => {
      showIR = value;
      $("#definition-button").setAttribute("aria-pressed", String(!showIR));
      $("#ir-button").setAttribute("aria-pressed", String(showIR));
      renderInspector();
    });
  }

  function showTranscript(state) {
    for (const button of document.querySelectorAll("[data-state]")) {
      button.disabled = false;
      button.setAttribute("aria-pressed", String(button.dataset.state === state));
    }
    $("#transcript-caption").textContent = state === "before"
      ? "After start-onboarding: a draft case exists; the review queue is empty."
      : "After request-review: the status is awaiting-review; Grace Example is assigned.";
    $("#transcript-output").textContent = JSON.stringify(scenario[state], null, 2);
  }
  for (const button of document.querySelectorAll("[data-state]")) {
    button.addEventListener("click", () => showTranscript(button.dataset.state));
  }
  renderList();
  renderGraph();
  select(selected);
  showTranscript("before");
  $("#workspace").hidden = false;
  $("#model-load-status").hidden = true;
}

loadExplorer().catch(() => {
  $("#model-load-status").replaceChildren(
    document.createTextNode("The interactive model could not load. "),
    Object.assign(make("a", "", "Open the exported model and transcript ↗"), { href: "/onboarded/model.json" }),
    document.createTextNode(" or reload to try again."),
  );
});

const passportStatuses = new Set(["us_citizen", "noncitizen_national"]);
function evaluateRule() {
  const failures = [];
  if (!passportStatuses.has($("#rule-status").value)) failures.push("the status is outside the example set");
  if ($("#rule-path").value !== "list_a") failures.push("the document path is not List A");
  if ($("#rule-document").value !== "us_passport") failures.push("the selected document is not a US passport");
  const result = $("#rule-result");
  result.dataset.match = String(failures.length === 0);
  result.replaceChildren(make("strong", "", failures.length ? "Condition does not match" : "Condition matches"), make("span", "", failures.length
    ? `The predicate is false because ${failures.join("; ")}.`
    : "The status is in the example set, the path is List A, and the selection is a US passport."));
}
$("#rule-form").addEventListener("change", evaluateRule);
$("#rule-form").addEventListener("submit", (event) => event.preventDefault());
evaluateRule();

const permissionFacts = new Set([":membership/role", ":membership/account"]);
function evaluateScope() {
  const attribute = $("#scope-read").value;
  const loaded = permissionFacts.has(attribute);
  const result = $("#scope-result");
  result.dataset.match = String(loaded);
  result.replaceChildren(make("strong", "", loaded ? "Within the proposed scope" : "Outside the proposed scope"), make("span", "", loaded
    ? `${attribute} is a loaded permission fact.`
    : `${attribute} is not loaded. A future checker could flag this read at its source location.`));
}
$("#scope-read").addEventListener("change", evaluateScope);
evaluateScope();

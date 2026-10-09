const $ = (selector) => document.querySelector(selector);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const recordTypes = new Set(["Organization", "Account", "User", "OrganizationMembership", "GroupMembership", "Employee", "Employer", "Placement", "Task"]);
const graphLabels = {
  OrganizationMembership: "Org. membership", GroupMembership: "Group membership", UserGroup: "User group",
  TaskLineage: "Form lineage", TaskVersion: "Form version", TaskTemplate: "Task template",
  SubtaskTemplate: "Page template", FieldTemplate: "Field template", CustomProperty: "Custom property",
  PolicyForm: "Policy form", AuthzInferenceRule: "Inference rule",
};
const groups = [
  ["Objects", "objectTypes", "◇"], ["Links", "linkTypes", "↗"],
  ["Actions", "actionTypes", "λ"], ["Queries", "queryTypes", "?"],
];

async function loadExplorer() {
  const response = await fetch("/onboarded/model.json");
  if (!response.ok) throw new Error(`Model returned HTTP ${response.status}`);
  const { ontology, scenario, permissionProperties, views } = await response.json();
  const declarations = groups.flatMap(([, key]) => ontology[key]);
  const byName = new Map(declarations.map((item) => [item.name, item]));
  const edges = [
    ...ontology.objectTypes.flatMap((item) => item.properties
      .filter((property) => property.valueType.kind === "ref")
      .map((property) => ({ from: item.name, to: property.valueType.target, name: property.name }))),
    ...ontology.linkTypes.map((item) => ({ from: item.from, to: item.to, name: item.name })),
  ];
  let selected = "Task";
  let currentView = "work";
  let showIR = false;

  function select(name) {
    if (!byName.has(name)) return;
    selected = name;
    if (byName.get(name).kind === "object-type" && !views[currentView].positions[name]) {
      currentView = Object.keys(views).find((view) => views[view].positions[name]);
      renderGraph();
    } else if (byName.get(name).kind !== "object-type") {
      const preferredView = name === "form-versions" ? "forms" : "work";
      if (currentView !== preferredView) {
        currentView = preferredView;
        renderGraph();
      }
    }
    for (const button of document.querySelectorAll("[data-select]")) {
      button.setAttribute("aria-pressed", String(button.dataset.select === name));
    }
    const list = $("#declaration-list");
    const listButton = [...list.querySelectorAll("button")].find((button) => button.dataset.select === name);
    if (listButton) {
      const bounds = list.getBoundingClientRect();
      const buttonBounds = listButton.getBoundingClientRect();
      if (buttonBounds.top < bounds.top) list.scrollTop += buttonBounds.top - bounds.top;
      else if (buttonBounds.bottom > bounds.bottom) list.scrollTop += buttonBounds.bottom - bounds.bottom;
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
    const { positions, caption, routes = {} } = views[currentView];
    const visibleEdges = edges.filter((edge) => positions[edge.from] && positions[edge.to]);
    $("#edges").replaceChildren();
    $("#graph-nodes").replaceChildren();
    for (const button of document.querySelectorAll("[data-view]")) {
      button.setAttribute("aria-pressed", String(button.dataset.view === currentView));
    }
    $("#graph-caption").textContent = caption;
    const namespace = "http://www.w3.org/2000/svg";
    for (const edge of visibleEdges) {
      const [fromX, fromY] = positions[edge.from];
      const [toX, toY] = positions[edge.to];
      const dx = toX - fromX;
      const dy = toY - fromY;
      const boundary = Math.min(73 / Math.abs(dx), 32 / Math.abs(dy));
      const offsetX = dx * boundary;
      const offsetY = dy * boundary;
      const group = document.createElementNS(namespace, "g");
      group.classList.add("ob-edge");
      Object.assign(group.dataset, edge);
      const route = routes[`${edge.from}.${edge.name}`];
      const path = document.createElementNS(namespace, "path");
      path.setAttribute("d", route
        ? route.points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")
        : `M${fromX + offsetX} ${fromY + offsetY} L${toX - offsetX} ${toY - offsetY}`);
      const label = document.createElementNS(namespace, "text");
      label.setAttribute("x", String(route?.label[0] ?? ((fromX + toX) / 2 + (dx === 0 ? 8 : 0))));
      label.setAttribute("y", String(route?.label[1] ?? ((fromY + toY) / 2 - (dy === 0 ? 10 : 6))));
      label.setAttribute("text-anchor", route?.anchor ?? (dx === 0 ? "start" : "middle"));
      label.textContent = edge.name;
      group.append(path, label);
      $("#edges").append(group);
    }
    for (const item of ontology.objectTypes.filter((item) => positions[item.name])) {
      const [x, y] = positions[item.name];
      const button = make("button", "ob-node");
      button.type = "button";
      button.dataset.select = item.name;
      button.dataset.layer = recordTypes.has(item.name) ? "record" : "config";
      button.style.left = `${x / 6}%`;
      button.style.top = `${y / 5}%`;
      button.setAttribute("aria-label", `Inspect ${item.name}, ${item.properties.length} properties`);
      button.append(make("strong", "", graphLabels[item.name] ?? item.name), make("span", "", `${item.properties.length} ${item.properties.length === 1 ? "property" : "properties"}`));
      $("#graph-nodes").append(button);
    }
    $("#model-counts").textContent = `${Object.keys(positions).length} of ${ontology.objectTypes.length} objects · ${visibleEdges.length} connections`;
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
  for (const [key, view] of Object.entries(views)) {
    const button = make("button", "", view.label);
    button.type = "button";
    button.dataset.view = key;
    button.addEventListener("click", () => {
      currentView = key;
      renderGraph();
      select(views[key].positions[selected] ? selected : view.focus);
    });
    $("#graph-views").append(button);
  }
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
    $("#transcript-caption").textContent = {
      before: "After start-task: an employee task references Example form v1; the review queue is empty.",
      after: "After request-review: the next action is employer-review; grace@example.invalid is assigned.",
      reassigned: "After reassignment: lee@example.invalid replaces the previous employer assignee.",
    }[state];
    $("#transcript-output").textContent = JSON.stringify(scenario[state], null, 2);
  }
  for (const button of document.querySelectorAll("[data-state]")) {
    button.addEventListener("click", () => showTranscript(button.dataset.state));
  }
  renderList();
  renderGraph();
  $("#workspace").hidden = false;
  select(selected);
  showTranscript("before");
  setupPermissionScope(permissionProperties);
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

function setupPermissionScope(properties) {
  const select = $("#scope-read");
  select.replaceChildren();
  $("#scope-facts").replaceChildren(make("span", "ob-label", "Example properties flagged for permission scope"));
  for (const property of properties) {
    const option = make("option", "", property.path);
    option.value = property.path;
    select.append(option);
    if (property.isPermissionScope) $("#scope-facts").append(make("code", "", property.path));
  }
  function evaluateScope() {
    const property = properties.find((item) => item.path === select.value);
    const allowed = property.isPermissionScope;
    const result = $("#scope-result");
    result.dataset.match = String(allowed);
    result.replaceChildren(make("strong", "", allowed ? "Flagged for permission scope" : "Not a permission-scope property"), make("span", "", allowed
      ? `${property.path} has isPermissionScope: true in the synthetic property definitions.`
      : `${property.path} has isPermissionScope: false. A future authoring checker could flag this access-rule read.`));
  }
  select.disabled = false;
  select.addEventListener("change", evaluateScope);
  evaluateScope();
}

async function loadNorthwindStudy() {
  const response = await fetch("/onboarded/northwind-study.json");
  if (!response.ok) throw new Error(`Study returned HTTP ${response.status}`);
  const study = await response.json();
  function showSection(section) {
    for (const button of document.querySelectorAll("[data-northwind-section]")) {
      button.setAttribute("aria-pressed", String(button.dataset.northwindSection === section.id));
    }
    $("#northwind-description").replaceChildren(
      make("span", "ob-label", `[${section.status}] in the supplied sketch`),
      make("h3", "", section.title), make("p", "", section.summary),
      make("p", "ob-small", study.statusLegend[section.status]),
      make("p", "ob-small", section.note),
    );
    $("#northwind-resource").textContent = `Target resource: ${section.resource}`;
    $("#northwind-source").textContent = section.source;
  }
  for (const section of study.sections) {
    const button = make("button", "", section.title);
    button.type = "button";
    button.dataset.northwindSection = section.id;
    button.addEventListener("click", () => showSection(section));
    $("#northwind-tabs").append(button);
  }
  for (const item of study.cases) {
    const option = make("option", "", item.label);
    option.value = item.id;
    $("#northwind-case").append(option);
  }
  function showCase() {
    const item = study.cases.find((item) => item.id === $("#northwind-case").value);
    $("#northwind-case-note").textContent = item.note;
    $("#northwind-case-output").textContent = JSON.stringify({ given: item.given, authoredExpectations: item.expects }, null, 2);
  }
  $("#northwind-case").addEventListener("change", showCase);
  showSection(study.sections.find((section) => section.id === "policies"));
  showCase();
  $("#northwind-program").hidden = false;
  $("#northwind-cases").hidden = false;
  $("#northwind-load-status").hidden = true;
}

loadNorthwindStudy().catch(() => {
  $("#northwind-load-status").replaceChildren(
    document.createTextNode("The Northwind study could not load. "),
    Object.assign(make("a", "", "Read its selected excerpts and authored expectations ↗"), { href: "/onboarded/northwind-study.json" }),
  );
});

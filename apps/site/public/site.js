const tabs = [...document.querySelectorAll('.oo-home__tabs [role="tab"]')];
const panels = tabs.map((_, index) => document.getElementById(`panel-${index}`));
const description = document.getElementById("code-description");

function activateTab(index) {
  tabs.forEach((tab, tabIndex) => {
    const active = tabIndex === index;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    panels[tabIndex].hidden = !active;
  });
  description.textContent = tabs[index].dataset.description;
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(index));
  tab.addEventListener("keydown", (event) => {
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    activateTab(next);
    tabs[next].focus();
  });
});

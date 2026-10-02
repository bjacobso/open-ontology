// Progressive enhancement only: every word on the page is present without JavaScript.

const escape = (text) => text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);

const FORMS = new Set([
  "define-entity", "define-relation", "define-action", "define-mutation", "define-datalog-query",
]);
const OPERATIONS = new Set(["changes", "create", "set", "clear", "link", "now"]);
const TOKEN = /(;[^\n]*)|("(?:[^"\\]|\\.)*")|(:[A-Za-z][\w/-]*)|(-?\b\d[\d_]*\b)|([A-Za-z][\w-]*)/g;

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
  const targets = document.querySelectorAll(".oo-strip, .oo-section > *, .oo-community");
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

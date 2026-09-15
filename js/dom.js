// Minimal safe DOM builder. Text children always go through textContent, never innerHTML,
// so template names/authors/etc. pulled from remote JSON can't inject markup.
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function")
      el.addEventListener(key.slice(2), value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, value);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null || child === false) continue;
    el.appendChild(
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(child)
        : child,
    );
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const ICON_PATHS = {
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>',
};

// Small stroke-style (feather-icon-ish) SVGs for button labels — kept tiny and inline
// rather than pulled from an icon font/library, matching this project's zero-dependency,
// no-build-step approach.
export function icon(name, size = 14) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.innerHTML = ICON_PATHS[name] || "";
  return svg;
}

const CONTACT_RE = /^(.+?)\s*<([^\s<>]+@[^\s<>]+)>?\s*$/;

// Turns a "Name <email@example.com>" contact string into `Name <mailto-link>`.
// Falls back to plain text for anything that doesn't match (including a dangling
// "<email" with no closing bracket, which existing template drafts have used).
export function linkifyContact(text) {
  if (!text) return document.createTextNode("");
  const match = CONTACT_RE.exec(text);
  if (!match) return document.createTextNode(text);
  const [, name, email] = match;
  const frag = document.createDocumentFragment();
  frag.appendChild(
    h("a", { href: `mailto:${email}`, class: "contact-link" }, `${name}`),
  );
  return frag;
}

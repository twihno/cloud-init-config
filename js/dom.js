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

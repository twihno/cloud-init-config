import { clear, h, linkifyContact } from "./dom.js";

function defaultIcon() {
  return h("div", { class: "card-icon card-icon-fallback" }, [
    (() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "28");
      svg.setAttribute("height", "28");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.6");
      svg.innerHTML =
        '<path d="M6 2h9l3 3v17H6z" /><path d="M15 2v3h3" /><line x1="8.5" y1="12" x2="15.5" y2="12" /><line x1="8.5" y1="15.5" x2="15.5" y2="15.5" /><line x1="8.5" y1="8.5" x2="12" y2="8.5" />';
      return svg;
    })(),
  ]);
}

function templateIcon(template) {
  if (
    typeof template.icon === "string" &&
    /^data:image\//.test(template.icon)
  ) {
    return h("img", { class: "card-icon", src: template.icon, alt: "" });
  }
  return defaultIcon();
}

function badge(status, textByStatus) {
  const cls =
    {
      ok: "badge-ok",
      "update-available": "badge-warn",
      error: "badge-error",
      syncing: "badge-info",
    }[status] || "badge-info";
  return h("span", { class: `badge ${cls}` }, textByStatus[status] || status);
}

export function renderTemplateCard({
  template,
  onSelect,
  onRemove,
  removeTitle,
}) {
  const card = h(
    "article",
    {
      class: "card",
      tabindex: "0",
      role: "button",
      onclick: onSelect,
      onkeydown: (e) =>
        (e.key === "Enter" || e.key === " ") &&
        (e.preventDefault(), onSelect()),
    },
    [
      templateIcon(template),
      h("div", { class: "card-body" }, [
        h("h4", {}, template.name || "(unnamed template)"),
        h("p", { class: "card-meta" }, [
          template.version ? `v${template.version}` : null,
          template.version && template.author ? " · " : null,
          template.author ? linkifyContact(template.author) : null,
        ]),
      ]),
      onRemove
        ? h(
            "button",
            {
              type: "button",
              class: "btn btn-icon card-remove",
              title: removeTitle || "Remove",
              onclick: (e) => {
                e.stopPropagation();
                onRemove();
              },
            },
            "×",
          )
        : null,
    ],
  );
  return card;
}

function cardContainer(layout) {
  return h("div", { class: layout === "list" ? "card-list" : "card-grid" });
}

function emptyState(text) {
  return h("p", { class: "empty-state" }, text);
}

export function renderBrowseView(root, state, handlers) {
  clear(root);

  root.appendChild(
    renderSection({
      title: "Local configs",
      subtitle: "Imported into this browser — not shared with anyone.",
      status: null,
      layout: state.layout,
      cards: state.localTemplates.map((rec) =>
        renderTemplateCard({
          template: rec.template,
          onSelect: () =>
            handlers.onSelect({
              source: "local",
              id: rec.id,
              template: rec.template,
            }),
          onRemove: () => handlers.onRemoveLocal(rec.id),
          removeTitle: "Remove local config",
        }),
      ),
      empty: 'No local configs yet. Use "+ Local config" to import one.',
    }),
  );

  root.appendChild(
    renderSection({
      title: state.siteMeta?.index?.name || "Site templates",
      subtitle: siteSubtitle(state),
      status: state.siteStatus,
      statusText: {
        ok: "up to date",
        "offline-cache": "showing cached copy (offline)",
        error: "failed to load",
        loading: "loading…",
      },
      layout: state.layout,
      cards: state.siteTemplates.map((rec) =>
        renderTemplateCard({
          template: rec.template,
          onSelect: () =>
            handlers.onSelect({
              source: "site",
              path: rec.path,
              template: rec.template,
            }),
        }),
      ),
      empty:
        state.siteStatus === "loading"
          ? "Loading…"
          : "No site templates available.",
      errorText: state.siteError,
    }),
  );

  for (const repo of state.remoteRepos) {
    const templates = state.remoteTemplatesByRepo[repo.id] || [];
    root.appendChild(
      renderSection({
        title: repo.name,
        subtitle: repo.contact
          ? [`${repo.url} · `, linkifyContact(repo.contact)]
          : repo.url,
        status: repo.status,
        statusText: {
          ok: "up to date",
          "update-available": "update available",
          error: repo.lastError || "error",
          syncing: "syncing…",
        },
        layout: state.layout,
        cards: templates.map((rec) =>
          renderTemplateCard({
            template: rec.template,
            onSelect: () =>
              handlers.onSelect({
                source: "remote",
                repoId: repo.id,
                path: rec.path,
                template: rec.template,
              }),
          }),
        ),
        empty:
          repo.status === "error"
            ? "Could not load templates from this repository."
            : "No templates synced yet.",
        actions: [
          repo.status === "update-available" || !templates.length
            ? h(
                "button",
                {
                  type: "button",
                  class: "btn btn-ghost",
                  onclick: () => handlers.onSyncRepo(repo),
                },
                "Sync now",
              )
            : h(
                "button",
                {
                  type: "button",
                  class: "btn btn-ghost",
                  onclick: () => handlers.onSyncRepo(repo),
                },
                "Re-sync",
              ),
          h(
            "button",
            {
              type: "button",
              class: "btn btn-ghost",
              onclick: () => handlers.onRemoveRepo(repo),
            },
            "Remove",
          ),
        ],
      }),
    );
  }

  if (!state.remoteRepos.length) {
    root.appendChild(
      emptyState(
        'No remote repositories added yet. Use "+ Remote repo" to add one.',
      ),
    );
  }
}

function siteSubtitle(state) {
  const contact = state.siteMeta?.index?.contact;
  return contact
    ? ["Bundled with this site · ", linkifyContact(contact)]
    : "Bundled with this site";
}

function renderSection({
  title,
  subtitle,
  status,
  statusText = {},
  layout,
  cards,
  empty,
  actions = [],
  errorText,
}) {
  const header = h("div", { class: "repo-section-header" }, [
    h("div", { class: "repo-section-heading" }, [
      h("h3", {}, title),
      subtitle ? h("p", { class: "muted" }, subtitle) : null,
    ]),
    status ? badge(status, statusText) : null,
    actions.length ? h("div", { class: "repo-actions" }, actions) : null,
  ]);

  const body = cards.length
    ? (() => {
        const container = cardContainer(layout);
        for (const c of cards) container.appendChild(c);
        return container;
      })()
    : emptyState(empty);

  return h("section", { class: "repo-section" }, [
    header,
    errorText ? h("p", { class: "field-error" }, errorText) : null,
    body,
  ]);
}

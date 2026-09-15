import { clear, h, linkifyContact } from "@/dom.ts";
import { editorHref } from "@/routes.ts";
import type { SiteState } from "@/site.ts";
import type {
  LocalTemplateRecord,
  RemoteRepo,
  RemoteRepoStatus,
  RemoteTemplateRecord,
  Selection,
  Template,
} from "@/types.ts";

function defaultIcon(): HTMLElement {
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

function templateIcon(template: Template): HTMLElement {
  if (typeof template.icon === "string" && template.icon.startsWith("data:image/")) {
    return h("img", { class: "card-icon", src: template.icon, alt: "" });
  }
  return defaultIcon();
}

function badge(status: string, textByStatus: Record<string, string>): HTMLElement {
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
  href,
  onRemove,
  removeTitle,
}: {
  template: Template;
  href?: string;
  onRemove?: () => void;
  removeTitle?: string;
}): HTMLElement {
  const card = h(
    href ? "a" : "div",
    href ? { class: "card", href } : { class: "card card-static" },
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
              onclick: (e: Event) => {
                e.preventDefault();
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

function cardContainer(layout: "grid" | "list"): HTMLElement {
  return h("div", { class: layout === "list" ? "card-list" : "card-grid" });
}

function emptyState(text: string): HTMLElement {
  return h("p", { class: "empty-state" }, text);
}

export interface BrowseState {
  layout: "grid" | "list";
  site: SiteState;
  remoteRepos: RemoteRepo[];
  remoteTemplatesByRepo: Record<string, RemoteTemplateRecord[]>;
  localTemplates: LocalTemplateRecord[];
}

export interface BrowseHandlers {
  onSyncRepo: (repo: RemoteRepo) => void;
  onRemoveRepo: (repo: RemoteRepo) => void;
  onRemoveLocal: (id: string) => void;
}

export function renderBrowseView(
  root: HTMLElement,
  state: BrowseState,
  handlers: BrowseHandlers,
): void {
  clear(root);

  if (state.site.status !== "disabled") {
    root.appendChild(
      renderSection({
        title: state.site.index?.name || state.site.siteName || "Site Templates",
        subtitle: siteSubtitle(state.site),
        status: state.site.status,
        statusText: {
          ok: "up to date",
          "offline-cache": "showing cached copy (offline)",
          error: "failed to load",
          loading: "loading…",
        },
        layout: state.layout,
        cards: state.site.templates.map((rec) => {
          const selection: Selection = { source: "site", path: rec.path };
          return renderTemplateCard({
            template: rec.template,
            href: editorHref(selection),
          });
        }),
        empty: state.site.status === "loading" ? "Loading…" : "No site templates available.",
        errorText: state.site.status === "error" ? state.site.error : null,
      }),
    );
  }

  root.appendChild(
    renderSection({
      title: "Local configs",
      subtitle: "Imported into this browser — not shared with anyone.",
      status: null,
      layout: state.layout,
      cards: state.localTemplates.map((rec) => {
        const selection: Selection = { source: "local", id: rec.id };
        return renderTemplateCard({
          template: rec.template,
          href: editorHref(selection),
          onRemove: () => handlers.onRemoveLocal(rec.id),
          removeTitle: "Remove local config",
        });
      }),
      empty: 'No local configs yet. Use "+ Local config" to import one.',
    }),
  );

  for (const repo of state.remoteRepos) {
    const templates = state.remoteTemplatesByRepo[repo.id] || [];
    root.appendChild(
      renderSection({
        title: repo.name,
        subtitle: repo.contact ? [`${repo.url} · `, linkifyContact(repo.contact)] : repo.url,
        status: repo.status,
        statusText: {
          ok: "up to date",
          "update-available": "update available",
          error: repo.lastError || "error",
          syncing: "syncing…",
        },
        layout: state.layout,
        cards: templates.map((rec) => {
          const selection: Selection = {
            source: "remote",
            repoId: repo.id,
            path: rec.path,
          };
          return renderTemplateCard({
            template: rec.template,
            href: editorHref(selection),
          });
        }),
        empty:
          repo.status === "error"
            ? "Could not load templates from this repository."
            : "No templates synced yet.",
        actions: [
          h(
            "button",
            {
              type: "button",
              class: "btn btn-ghost",
              onclick: () => handlers.onSyncRepo(repo),
            },
            repo.status === "update-available" || !templates.length ? "Sync now" : "Re-sync",
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
      emptyState('No remote repositories added yet. Use "+ Remote repo" to add one.'),
    );
  }
}

function siteSubtitle(site: SiteState): string | (string | Node)[] {
  const contact = site.index?.contact;
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
}: {
  title: string;
  subtitle?: string | (string | Node)[] | null;
  status: RemoteRepoStatus | SiteState["status"] | null;
  statusText?: Record<string, string>;
  layout: "grid" | "list";
  cards: HTMLElement[];
  empty: string;
  actions?: HTMLElement[];
  errorText?: string | null;
}): HTMLElement {
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

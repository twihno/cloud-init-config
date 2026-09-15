import "@/style.css";
import { confirmDialog } from "@/confirm.ts";
import { setupLocalModal, setupRemoteModal } from "@/modals.ts";
import { type BrowseState, renderBrowseView } from "@/render-browse.ts";
import { LOADING_SITE_STATE, loadSite } from "@/site.ts";
import * as store from "@/store.ts";
import type { RemoteRepo, RemoteTemplateRecord } from "@/types.ts";

const LAYOUT_KEY = "cloud-init-config:layout";

const state: BrowseState = {
  layout: localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid",
  site: LOADING_SITE_STATE,
  remoteRepos: [],
  remoteTemplatesByRepo: {},
  localTemplates: [],
};

const dom = {
  siteTitle: document.getElementById("site-title") as HTMLElement,
  globalMessage: document.getElementById("global-message") as HTMLElement,
  browseSections: document.getElementById("browse-sections") as HTMLElement,
  btnLayoutGrid: document.getElementById("btn-layout-grid") as HTMLButtonElement,
  btnLayoutList: document.getElementById("btn-layout-list") as HTMLButtonElement,
  btnSyncAll: document.getElementById("btn-sync-all") as HTMLButtonElement,
  btnAddRemote: document.getElementById("btn-add-remote") as HTMLButtonElement,
  btnAddLocal: document.getElementById("btn-add-local") as HTMLButtonElement,
};

function showGlobalMessage(text: string, kind = "error"): void {
  dom.globalMessage.textContent = text;
  dom.globalMessage.className = `banner banner-${kind}`;
  dom.globalMessage.hidden = false;
}

function render(): void {
  renderBrowseView(dom.browseSections, state, {
    onSyncRepo: syncRepo,
    onRemoveRepo: removeRepo,
    onRemoveLocal: removeLocal,
  });
}

async function syncRepo(repo: RemoteRepo): Promise<void> {
  state.remoteRepos = state.remoteRepos.map((r) =>
    r.id === repo.id ? { ...r, status: "syncing" } : r,
  );
  render();
  try {
    const { repo: updated, errors } = await store.syncRemoteRepo(repo);
    state.remoteRepos = state.remoteRepos.map((r) => (r.id === updated.id ? updated : r));
    state.remoteTemplatesByRepo[updated.id] = await store.getRemoteTemplatesForRepo(updated.id);
    if (errors.length)
      showGlobalMessage(`${repo.name}: ${errors.length} template(s) failed to sync.`, "error");
  } catch (err) {
    showGlobalMessage(`Could not sync "${repo.name}": ${(err as Error).message}`, "error");
  }
  render();
}

async function removeRepo(repo: RemoteRepo): Promise<void> {
  const proceed = await confirmDialog({
    title: "Remove remote repository?",
    message: `Remove "${repo.name}"? Its cached templates will be deleted from this browser.`,
    confirmText: "Remove",
    danger: true,
  });
  if (!proceed) return;
  await store.removeRemoteRepo(repo.id);
  state.remoteRepos = state.remoteRepos.filter((r) => r.id !== repo.id);
  delete state.remoteTemplatesByRepo[repo.id];
  render();
}

async function removeLocal(id: string): Promise<void> {
  await store.removeLocalTemplate(id);
  state.localTemplates = state.localTemplates.filter((t) => t.id !== id);
  render();
}

function applyLayout(): void {
  dom.btnLayoutGrid.setAttribute("aria-pressed", String(state.layout === "grid"));
  dom.btnLayoutList.setAttribute("aria-pressed", String(state.layout === "list"));
}

dom.btnLayoutGrid.addEventListener("click", () => {
  state.layout = "grid";
  localStorage.setItem(LAYOUT_KEY, "grid");
  applyLayout();
  render();
});
dom.btnLayoutList.addEventListener("click", () => {
  state.layout = "list";
  localStorage.setItem(LAYOUT_KEY, "list");
  applyLayout();
  render();
});

dom.btnSyncAll.addEventListener("click", async () => {
  dom.btnSyncAll.disabled = true;
  try {
    await Promise.all(state.remoteRepos.map((repo) => syncRepo(repo)));
  } finally {
    dom.btnSyncAll.disabled = false;
  }
});

const localModal = setupLocalModal(
  {
    modal: document.getElementById("modal-add-local") as HTMLDialogElement,
    dropzone: document.getElementById("dropzone") as HTMLElement,
    fileInput: document.getElementById("local-file-input") as HTMLInputElement,
    resultsEl: document.getElementById("local-import-results") as HTMLElement,
    closeBtn: document.getElementById("btn-close-local-modal") as HTMLElement,
  },
  {
    onImported: async () => {
      state.localTemplates = await store.getAllLocalTemplates();
      render();
    },
  },
);
dom.btnAddLocal.addEventListener("click", () => localModal.open());

const remoteModal = setupRemoteModal(
  {
    modal: document.getElementById("modal-add-remote") as HTMLDialogElement,
    urlInput: document.getElementById("remote-url-input") as HTMLInputElement,
    fetchBtn: document.getElementById("btn-fetch-remote-preview") as HTMLButtonElement,
    previewSection: document.getElementById("remote-preview") as HTMLElement,
    previewName: document.getElementById("remote-preview-name") as HTMLElement,
    previewMeta: document.getElementById("remote-preview-meta") as HTMLElement,
    previewCards: document.getElementById("remote-preview-cards") as HTMLElement,
    previewErrors: document.getElementById("remote-preview-errors") as HTMLElement,
    errorEl: document.getElementById("remote-error") as HTMLElement,
    confirmBtn: document.getElementById("btn-confirm-add-remote") as HTMLButtonElement,
    cancelBtn: document.getElementById("btn-cancel-remote-modal") as HTMLElement,
  },
  {
    onAdded: async (repo) => {
      state.remoteRepos = [...state.remoteRepos, repo];
      state.remoteTemplatesByRepo[repo.id] = await store.getRemoteTemplatesForRepo(repo.id);
      render();
    },
  },
);
dom.btnAddRemote.addEventListener("click", () => remoteModal.open());

async function init(): Promise<void> {
  applyLayout();
  render();

  // Local imports and remote repo list load from IndexedDB immediately — no network needed.
  const [localTemplates, remoteRepos] = await Promise.all([
    store.getAllLocalTemplates(),
    store.getAllRemoteRepos(),
  ]);
  state.localTemplates = localTemplates;
  state.remoteRepos = remoteRepos;
  render();

  // Site config + its bundled template repo (if configured): always force-refreshed
  // (same-origin, cheap).
  void loadSiteRepo();

  // Each remote repo's index is refreshed to check for updates, but bodies are only
  // downloaded on an explicit sync (see checkRemoteRepoForUpdates in store.ts).
  for (const repo of remoteRepos) {
    void store.getRemoteTemplatesForRepo(repo.id).then((templates: RemoteTemplateRecord[]) => {
      state.remoteTemplatesByRepo[repo.id] = templates;
      render();
    });
    void store.checkRemoteRepoForUpdates(repo).then((updated) => {
      state.remoteRepos = state.remoteRepos.map((r) => (r.id === updated.id ? updated : r));
      render();
    });
  }
}

async function loadSiteRepo(): Promise<void> {
  const site = await loadSite();
  state.site = site;
  if (site.siteName) {
    dom.siteTitle.textContent = site.siteName;
    document.title = site.siteName;
  }
  if (site.error) showGlobalMessage(site.error, "error");
  render();
}

void init();

import { confirmDialog } from "./confirm.js";
import { mountEditor } from "./editor.js";
import { setupLocalModal, setupRemoteModal } from "./modals.js";
import { renderBrowseView } from "./render-browse.js";
import * as store from "./store.js";

const LAYOUT_KEY = "cloud-init-config:layout";

const state = {
  layout: localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid",
  siteStatus: "loading",
  siteError: null,
  siteTemplates: [],
  siteMeta: null,
  remoteRepos: [],
  remoteTemplatesByRepo: {},
  localTemplates: [],
};

const dom = {
  siteTitle: document.getElementById("site-title"),
  siteSubtitle: document.getElementById("site-subtitle"),
  globalMessage: document.getElementById("global-message"),
  browseSections: document.getElementById("browse-sections"),
  viewBrowse: document.getElementById("view-browse"),
  viewEditor: document.getElementById("view-editor"),
  browseHeaderActions: document.getElementById("browse-header-actions"),
  editorHeaderActions: document.getElementById("editor-header-actions"),
  btnBack: document.getElementById("btn-back"),
  btnLayoutGrid: document.getElementById("btn-layout-grid"),
  btnLayoutList: document.getElementById("btn-layout-list"),
  btnSyncAll: document.getElementById("btn-sync-all"),
  btnAddRemote: document.getElementById("btn-add-remote"),
  btnAddLocal: document.getElementById("btn-add-local"),
  editor: {
    titleEl: document.getElementById("editor-title"),
    metaEl: document.getElementById("editor-meta"),
    iconEl: document.getElementById("editor-icon"),
    formEl: document.getElementById("config-form"),
    previewCardsEl: document.getElementById("preview-cards"),
    replaceBtn: document.getElementById("btn-replace-disk"),
    replaceHintEl: document.getElementById("replace-disk-hint"),
  },
};

function showGlobalMessage(text, kind = "error") {
  dom.globalMessage.textContent = text;
  dom.globalMessage.className = `banner banner-${kind}`;
  dom.globalMessage.hidden = false;
}

function render() {
  renderBrowseView(dom.browseSections, state, {
    onSelect: openEditor,
    onSyncRepo: syncRepo,
    onRemoveRepo: removeRepo,
    onRemoveLocal: removeLocal,
  });
}

function switchView(view) {
  dom.viewBrowse.hidden = view !== "browse";
  dom.viewEditor.hidden = view !== "editor";
  dom.browseHeaderActions.hidden = view !== "browse";
  dom.editorHeaderActions.hidden = view !== "editor";
}

function openEditor(selection) {
  mountEditor(dom.editor, selection);
  switchView("editor");
  dom.viewEditor.scrollTo(0, 0);
}

async function syncRepo(repo) {
  state.remoteRepos = state.remoteRepos.map((r) =>
    r.id === repo.id ? { ...r, status: "syncing" } : r,
  );
  render();
  try {
    const { repo: updated, errors } = await store.syncRemoteRepo(repo);
    state.remoteRepos = state.remoteRepos.map((r) =>
      r.id === updated.id ? updated : r,
    );
    state.remoteTemplatesByRepo[updated.id] =
      await store.getRemoteTemplatesForRepo(updated.id);
    if (errors.length)
      showGlobalMessage(
        `${repo.name}: ${errors.length} template(s) failed to sync.`,
        "error",
      );
  } catch (err) {
    showGlobalMessage(`Could not sync "${repo.name}": ${err.message}`, "error");
  }
  render();
}

async function removeRepo(repo) {
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

async function removeLocal(id) {
  await store.removeLocalTemplate(id);
  state.localTemplates = state.localTemplates.filter((t) => t.id !== id);
  render();
}

function applyLayout() {
  dom.btnLayoutGrid.setAttribute(
    "aria-pressed",
    String(state.layout === "grid"),
  );
  dom.btnLayoutList.setAttribute(
    "aria-pressed",
    String(state.layout === "list"),
  );
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
dom.btnBack.addEventListener("click", () => switchView("browse"));

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
    modal: document.getElementById("modal-add-local"),
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("local-file-input"),
    resultsEl: document.getElementById("local-import-results"),
    closeBtn: document.getElementById("btn-close-local-modal"),
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
    modal: document.getElementById("modal-add-remote"),
    urlInput: document.getElementById("remote-url-input"),
    fetchBtn: document.getElementById("btn-fetch-remote-preview"),
    previewSection: document.getElementById("remote-preview"),
    previewName: document.getElementById("remote-preview-name"),
    previewMeta: document.getElementById("remote-preview-meta"),
    previewCards: document.getElementById("remote-preview-cards"),
    previewErrors: document.getElementById("remote-preview-errors"),
    errorEl: document.getElementById("remote-error"),
    confirmBtn: document.getElementById("btn-confirm-add-remote"),
    cancelBtn: document.getElementById("btn-cancel-remote-modal"),
  },
  {
    onAdded: async (repo) => {
      state.remoteRepos = [...state.remoteRepos, repo];
      state.remoteTemplatesByRepo[repo.id] =
        await store.getRemoteTemplatesForRepo(repo.id);
      render();
    },
  },
);
dom.btnAddRemote.addEventListener("click", () => remoteModal.open());

async function init() {
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

  // Site config + its bundled template repo: always force-refreshed (same-origin, cheap).
  loadSiteRepo();

  // Each remote repo's index is refreshed to check for updates, but bodies are only
  // downloaded on an explicit sync (see checkRemoteRepoForUpdates in store.js).
  for (const repo of remoteRepos) {
    store.getRemoteTemplatesForRepo(repo.id).then((templates) => {
      state.remoteTemplatesByRepo[repo.id] = templates;
      render();
    });
    store.checkRemoteRepoForUpdates(repo).then((updated) => {
      state.remoteRepos = state.remoteRepos.map((r) =>
        r.id === updated.id ? updated : r,
      );
      render();
    });
  }
}

async function loadSiteRepo() {
  try {
    const config = await store.loadSiteConfig();
    dom.siteTitle.textContent = config.name || "Cloud-Init Config";
    if (!config.templates)
      throw new Error('config.json is missing a "templates" path.');
    const { index, templates, errors } = await store.forceSyncSiteRepo(
      config.templates,
    );
    state.siteTemplates = templates;
    state.siteMeta = { index };
    state.siteStatus = "ok";
    state.siteError = null;
    if (errors.length)
      showGlobalMessage(
        `${errors.length} site template(s) failed to load: ${errors.map((e) => e.message).join(" ")}`,
        "error",
      );
  } catch (err) {
    const cached = await store.getCachedSiteTemplates();
    if (cached.templates.length) {
      state.siteTemplates = cached.templates;
      state.siteMeta = cached.meta ? { index: cached.meta.index } : null;
      state.siteStatus = "offline-cache";
      state.siteError = null;
      showGlobalMessage(
        `Could not refresh site templates (${err.message}). Showing the last cached copy.`,
        "error",
      );
    } else {
      state.siteTemplates = [];
      state.siteStatus = "error";
      state.siteError = err.message;
    }
  }
  render();
}

init();

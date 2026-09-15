import "@/style.css";
import { mountEditor } from "@/editor.ts";
import { homeHref, parseSelectionFromSearch } from "@/routes.ts";
import * as store from "@/store.ts";
import type { Selection, Template } from "@/types.ts";

(document.getElementById("btn-back") as HTMLAnchorElement).href = homeHref();

const dom = {
  loadError: document.getElementById("editor-load-error") as HTMLElement,
  content: document.getElementById("editor-content") as HTMLElement,
  tabConfig: document.getElementById("tab-config") as HTMLButtonElement,
  tabPreview: document.getElementById("tab-preview") as HTMLButtonElement,
  configFormPanel: document.getElementById("config-form-panel") as HTMLElement,
  previewPanel: document.getElementById("preview-panel") as HTMLElement,
  editor: {
    titleEl: document.getElementById("editor-title") as HTMLElement,
    metaEl: document.getElementById("editor-meta") as HTMLElement,
    iconEl: document.getElementById("editor-icon") as HTMLImageElement,
    formEl: document.getElementById("config-form") as HTMLFormElement,
    previewCardsEl: document.getElementById("preview-cards") as HTMLElement,
    replaceBtn: document.getElementById("btn-replace-disk") as HTMLButtonElement,
    replaceHintEl: document.getElementById("replace-disk-hint") as HTMLElement,
  },
};

// Mobile only (see the max-width: 860px rule in style.css) — on desktop both panels are
// always visible via the CSS grid and this attribute has no effect.
function setEditorTab(tab: "config" | "preview"): void {
  const isConfig = tab === "config";
  dom.tabConfig.setAttribute("aria-pressed", String(isConfig));
  dom.tabPreview.setAttribute("aria-pressed", String(!isConfig));
  dom.configFormPanel.toggleAttribute("data-tab-hidden", !isConfig);
  dom.previewPanel.toggleAttribute("data-tab-hidden", isConfig);
}
dom.tabConfig.addEventListener("click", () => setEditorTab("config"));
dom.tabPreview.addEventListener("click", () => setEditorTab("preview"));

function showError(message: string): void {
  dom.loadError.textContent = message;
  dom.loadError.hidden = false;
  dom.content.hidden = true;
}

async function resolveTemplate(selection: Selection): Promise<Template> {
  if (selection.source === "local") {
    const record = await store.getLocalTemplate(selection.id);
    if (!record)
      throw new Error(
        "This local config was not found in this browser. It may have been removed, or you're on a different device/browser than where you imported it.",
      );
    return record.template;
  }
  if (selection.source === "remote") {
    const templates = await store.getRemoteTemplatesForRepo(selection.repoId);
    const record = templates.find((t) => t.path === selection.path);
    if (!record)
      throw new Error(
        "This template was not found in the remote repository's cached templates. Try syncing the repository again from the home page.",
      );
    return record.template;
  }
  // source === "site"
  const config = await store.loadSiteConfig();
  if (!config.templates) throw new Error("This site has no configured template repository.");
  const { templates, errors } = await store.forceSyncSiteRepo(config.templates);
  const record = templates.find((t) => t.path === selection.path);
  if (!record) {
    const detail = errors.find((e) => e.path === selection.path);
    throw new Error(
      detail
        ? `Could not load this site template: ${detail.message}`
        : "This site template was not found.",
    );
  }
  return record.template;
}

async function init(): Promise<void> {
  const selection = parseSelectionFromSearch(location.search);
  if (!selection) {
    showError("No template was specified. Go back and pick one from the list.");
    return;
  }
  let template: Template;
  try {
    template = await resolveTemplate(selection);
  } catch (err) {
    showError((err as Error).message);
    return;
  }
  document.title = `${template.name || "Configure template"} – Cloud-Init Config`;
  dom.loadError.hidden = true;
  dom.content.hidden = false;
  mountEditor(dom.editor, template);
  setEditorTab("config");
}

void init();

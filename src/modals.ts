import { clear, h, linkifyContact } from "@/dom.ts";
import { renderTemplateCard } from "@/render-browse.ts";
import * as store from "@/store.ts";
import { validateTemplateShape } from "@/templater.ts";
import type { RepoPreview } from "@/store.ts";
import type { RemoteRepo } from "@/types.ts";

export interface LocalModalRefs {
  modal: HTMLDialogElement;
  dropzone: HTMLElement;
  fileInput: HTMLInputElement;
  resultsEl: HTMLElement;
  closeBtn: HTMLElement;
}

export function setupLocalModal(
  dom: LocalModalRefs,
  { onImported }: { onImported: () => void | Promise<void> },
): { open: () => void } {
  const { modal, dropzone, fileInput, resultsEl, closeBtn } = dom;

  async function processFiles(fileList: FileList) {
    for (const file of Array.from(fileList)) {
      const row = h("li", {}, `${file.name}: checking…`);
      resultsEl.appendChild(row);
      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          throw new Error(`Not valid JSON (${(err as Error).message}).`);
        }
        const shapeErrors = validateTemplateShape(parsed);
        if (shapeErrors.length) throw new Error(shapeErrors.join(" "));
        const template = parsed as import("@/types.ts").Template;
        await store.addLocalTemplate(file.name, template);
        row.textContent = `${file.name}: added "${template.name}".`;
        row.classList.add("import-ok");
      } catch (err) {
        row.textContent = `${file.name}: ${(err as Error).message}`;
        row.classList.add("import-error");
      }
    }
    await onImported();
  }

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer?.files.length) void processFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) void processFiles(fileInput.files);
    fileInput.value = "";
  });
  closeBtn.addEventListener("click", () => {
    modal.close();
    clear(resultsEl);
  });

  return {
    open: () => modal.showModal(),
  };
}

export interface RemoteModalRefs {
  modal: HTMLDialogElement;
  urlInput: HTMLInputElement;
  fetchBtn: HTMLButtonElement;
  previewSection: HTMLElement;
  previewName: HTMLElement;
  previewMeta: HTMLElement;
  previewCards: HTMLElement;
  previewErrors: HTMLElement;
  errorEl: HTMLElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLElement;
}

export function setupRemoteModal(
  dom: RemoteModalRefs,
  { onAdded }: { onAdded: (repo: RemoteRepo) => void | Promise<void> },
): { open: () => void } {
  const {
    modal,
    urlInput,
    fetchBtn,
    previewSection,
    previewName,
    previewMeta,
    previewCards,
    previewErrors,
    errorEl,
    confirmBtn,
    cancelBtn,
  } = dom;

  let previewData: RepoPreview | null = null;

  function reset() {
    previewData = null;
    previewSection.hidden = true;
    errorEl.hidden = true;
    confirmBtn.disabled = true;
    urlInput.value = "";
    clear(previewCards);
    clear(previewErrors);
  }

  fetchBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    errorEl.hidden = true;
    previewSection.hidden = true;
    confirmBtn.disabled = true;
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Fetching…";
    try {
      previewData = await store.fetchRepoPreview(url);
      previewName.textContent = previewData.index.name || url;
      clear(previewMeta);
      if (previewData.index.contact)
        previewMeta.appendChild(linkifyContact(previewData.index.contact));
      if (previewData.index.last_update) {
        if (previewData.index.contact) previewMeta.appendChild(document.createTextNode(" · "));
        previewMeta.appendChild(
          document.createTextNode(`updated ${previewData.index.last_update}`),
        );
      }
      clear(previewCards);
      for (const t of previewData.templates) {
        previewCards.appendChild(renderTemplateCard({ template: t.template }));
      }
      clear(previewErrors);
      for (const err of previewData.errors) {
        previewErrors.appendChild(
          h("li", { class: "import-error" }, `${err.path}: ${err.message}`),
        );
      }
      previewSection.hidden = false;
      confirmBtn.disabled = previewData.templates.length === 0;
    } catch (err) {
      errorEl.textContent = (err as Error).message;
      errorEl.hidden = false;
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = "Fetch preview";
    }
  });

  confirmBtn.addEventListener("click", async () => {
    if (!previewData) return;
    const repo = await store.addRemoteRepo(previewData);
    modal.close();
    reset();
    await onAdded(repo);
  });

  cancelBtn.addEventListener("click", () => {
    modal.close();
    reset();
  });

  return {
    open: () => {
      reset();
      modal.showModal();
    },
  };
}

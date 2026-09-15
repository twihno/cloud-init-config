import { clear, h, linkifyContact } from "./dom.js";
import { renderTemplateCard } from "./render-browse.js";
import * as store from "./store.js";
import { validateTemplateShape } from "./templater.js";

export function setupLocalModal(dom, { onImported }) {
  const { modal, dropzone, fileInput, resultsEl, closeBtn } = dom;

  async function processFiles(fileList) {
    for (const file of fileList) {
      const row = h("li", {}, `${file.name}: checking…`);
      resultsEl.appendChild(row);
      try {
        const text = await file.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          throw new Error(`Not valid JSON (${err.message}).`);
        }
        const shapeErrors = validateTemplateShape(parsed);
        if (shapeErrors.length) throw new Error(shapeErrors.join(" "));
        await store.addLocalTemplate(file.name, parsed);
        row.textContent = `${file.name}: added "${parsed.name}".`;
        row.classList.add("import-ok");
      } catch (err) {
        row.textContent = `${file.name}: ${err.message}`;
        row.classList.add("import-error");
      }
    }
    onImported();
  }

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () =>
    dropzone.classList.remove("dragover"),
  );
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) processFiles(fileInput.files);
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

export function setupRemoteModal(dom, { onAdded }) {
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

  let previewData = null;

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
        if (previewData.index.contact)
          previewMeta.appendChild(document.createTextNode(" · "));
        previewMeta.appendChild(
          document.createTextNode(`updated ${previewData.index.last_update}`),
        );
      }
      clear(previewCards);
      for (const t of previewData.templates) {
        previewCards.appendChild(
          renderTemplateCard({ template: t.template, onSelect: () => {} }),
        );
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
      errorEl.textContent = err.message;
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
    onAdded(repo);
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

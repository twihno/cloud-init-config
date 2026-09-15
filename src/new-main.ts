import "@/style.css";
import { confirmDialog } from "@/confirm.ts";
import {
  availableFileKeys,
  buildTemplate,
  CLOUD_INIT_FILE_KEYS,
  crossValidate,
  draftFromTemplate,
  emptyDraft,
  fieldTypeLabel,
  FIELD_TYPES,
  hasBlockingIssues,
  isBooleanType,
  newDraftField,
  newDraftFile,
  restrictionKindsFor,
  slugify,
  validateDraftField,
  validateDraftFile,
  validateMeta,
  type DraftField,
  type DraftFile,
  type DraftTemplate,
} from "@/creator.ts";
import { clear, h } from "@/dom.ts";
import { flash } from "@/editor.ts";
import { copyText, downloadFile } from "@/export.ts";
import { renderTemplateCard } from "@/render-browse.ts";
import { highlightYaml } from "@/syntax-highlight.ts";
import { validateTemplateShape } from "@/templater.ts";
import type { EnumOption, FieldType, Template } from "@/types.ts";

const draft: DraftTemplate = emptyDraft();

const dom = {
  tabConfig: document.getElementById("tab-config") as HTMLButtonElement,
  tabPreview: document.getElementById("tab-preview") as HTMLButtonElement,
  configFormPanel: document.getElementById("config-form-panel") as HTMLElement,
  previewPanel: document.getElementById("preview-panel") as HTMLElement,
  previewCards: document.getElementById("preview-cards") as HTMLElement,

  btnToggleMeta: document.getElementById("btn-toggle-meta") as HTMLButtonElement,
  metaForm: document.getElementById("meta-form") as HTMLElement,
  metaPreview: document.getElementById("meta-preview") as HTMLElement,

  nameInput: document.getElementById("meta-name") as HTMLInputElement,
  nameError: document.getElementById("meta-name-error") as HTMLElement,
  authorInput: document.getElementById("meta-author") as HTMLInputElement,
  authorError: document.getElementById("meta-author-error") as HTMLElement,
  versionInput: document.getElementById("meta-version") as HTMLInputElement,
  versionError: document.getElementById("meta-version-error") as HTMLElement,

  iconDropzone: document.getElementById("icon-dropzone") as HTMLLabelElement,
  iconDropzoneText: document.getElementById("icon-dropzone-text") as HTMLElement,
  iconInput: document.getElementById("meta-icon-input") as HTMLInputElement,
  iconPreview: document.getElementById("meta-icon-preview") as HTMLImageElement,
  iconClear: document.getElementById("meta-icon-clear") as HTMLButtonElement,
  iconError: document.getElementById("meta-icon-error") as HTMLElement,

  variablesList: document.getElementById("variables-list") as HTMLElement,
  btnAddVariable: document.getElementById("btn-add-variable") as HTMLButtonElement,
  filesList: document.getElementById("files-list") as HTMLElement,
  addFileActions: document.getElementById("add-file-actions") as HTMLElement,

  issuesSection: document.getElementById("creator-issues") as HTMLElement,
  issuesList: document.getElementById("issues-list") as HTMLElement,
  btnOpenTemplate: document.getElementById("btn-open-template") as HTMLButtonElement,
  openTemplateInput: document.getElementById("open-template-input") as HTMLInputElement,
  btnCopyJson: document.getElementById("btn-copy-json") as HTMLButtonElement,
  btnSaveJson: document.getElementById("btn-save-json") as HTMLButtonElement,
};

function setFieldError(el: HTMLElement, message?: string): void {
  el.textContent = message || "";
  el.hidden = !message;
}

// Mobile only (see the max-width: 860px rule in style.css) — on desktop both panels are
// always visible via the CSS grid and this attribute has no effect.
function setTab(tab: "config" | "preview"): void {
  const isConfig = tab === "config";
  dom.tabConfig.setAttribute("aria-pressed", String(isConfig));
  dom.tabPreview.setAttribute("aria-pressed", String(!isConfig));
  dom.configFormPanel.toggleAttribute("data-tab-hidden", !isConfig);
  dom.previewPanel.toggleAttribute("data-tab-hidden", isConfig);
}
dom.tabConfig.addEventListener("click", () => setTab("config"));
dom.tabPreview.addEventListener("click", () => setTab("preview"));
setTab("config");

function refreshIssues(): void {
  const issues = crossValidate(draft);
  clear(dom.issuesList);
  for (const issue of issues) {
    dom.issuesList.appendChild(
      h("li", { class: issue.level === "error" ? "import-error" : "muted" }, issue.message),
    );
  }
  dom.issuesSection.hidden = issues.length === 0;
}

function refreshPreviewCards(): void {
  clear(dom.previewCards);
  if (!draft.files.length) {
    dom.previewCards.appendChild(
      h("p", { class: "empty-state" }, "Add a file to see its content previewed here."),
    );
    return;
  }
  for (const file of draft.files) {
    const pre = h("pre", { class: "preview-content" });
    pre.innerHTML = file.content.trim() ? highlightYaml(file.content) : "";
    dom.previewCards.appendChild(
      h("article", { class: "preview-card" }, [
        h("div", { class: "preview-card-header" }, [h("h4", {}, file.key)]),
        pre,
      ]),
    );
  }
}

// ---------- Template details (collapsible) ----------

function currentPreviewTemplate(): Template {
  return {
    name: draft.name.trim() || "(unnamed template)",
    author: draft.author.trim() || undefined,
    version: draft.version.trim() || undefined,
    icon: draft.icon.trim() || undefined,
    templates: {},
  };
}

function refreshMetaPreview(): void {
  clear(dom.metaPreview);
  dom.metaPreview.appendChild(renderTemplateCard({ template: currentPreviewTemplate() }));
}

function setMetaCollapsed(collapsed: boolean): void {
  dom.metaForm.hidden = collapsed;
  dom.metaPreview.hidden = !collapsed;
  dom.btnToggleMeta.textContent = collapsed ? "Expand" : "Collapse";
  if (collapsed) refreshMetaPreview();
}

dom.btnToggleMeta.addEventListener("click", () => {
  setMetaCollapsed(Boolean(dom.metaPreview.hidden));
});

function refreshMetaErrors(): void {
  const errors = validateMeta(draft);
  setFieldError(dom.nameError, errors.name);
  setFieldError(dom.authorError, errors.author);
  setFieldError(dom.versionError, errors.version);
  setFieldError(dom.iconError, errors.icon);
  if (!dom.metaPreview.hidden) refreshMetaPreview();
}

dom.nameInput.addEventListener("input", () => {
  draft.name = dom.nameInput.value;
  refreshMetaErrors();
});
dom.authorInput.addEventListener("input", () => {
  draft.author = dom.authorInput.value;
  refreshMetaErrors();
});
dom.versionInput.addEventListener("input", () => {
  draft.version = dom.versionInput.value;
  refreshMetaErrors();
});

// ---------- Icon (drag & drop) ----------

function setIcon(dataUrl: string): void {
  draft.icon = dataUrl;
  if (dataUrl) {
    dom.iconPreview.src = dataUrl;
    dom.iconPreview.hidden = false;
    dom.iconClear.hidden = false;
    dom.iconDropzoneText.textContent = "Drop or click to replace";
  } else {
    dom.iconPreview.removeAttribute("src");
    dom.iconPreview.hidden = true;
    dom.iconClear.hidden = true;
    dom.iconDropzoneText.textContent = "Drag & drop an image here, or click to choose";
  }
  refreshMetaErrors();
}

function loadIconFile(file: File): void {
  if (!file.type.startsWith("image/")) {
    setFieldError(dom.iconError, "That doesn't look like an image file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setIcon(typeof reader.result === "string" ? reader.result : "");
  reader.readAsDataURL(file);
}

dom.iconDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dom.iconDropzone.classList.add("dragover");
});
dom.iconDropzone.addEventListener("dragleave", () => {
  dom.iconDropzone.classList.remove("dragover");
});
dom.iconDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dom.iconDropzone.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (file) loadIconFile(file);
});
dom.iconInput.addEventListener("change", () => {
  const file = dom.iconInput.files?.[0];
  if (file) loadIconFile(file);
  dom.iconInput.value = "";
});
dom.iconClear.addEventListener("click", () => setIcon(""));

// ---------- Variables ----------

function renderVariables(): void {
  clear(dom.variablesList);
  if (!draft.fields.length) {
    dom.variablesList.appendChild(
      h("p", { class: "empty-state" }, 'No variables yet. Use "+ Add variable" to define one.'),
    );
  }
  for (const field of draft.fields) {
    dom.variablesList.appendChild(createVariableRow(field));
  }
  refreshIssues();
}

function removeVariable(field: DraftField): void {
  draft.fields = draft.fields.filter((f) => f !== field);
  renderVariables();
}

function createVariableRow(field: DraftField): HTMLElement {
  const container = h("div", { class: "field creator-row" });
  let keyError: HTMLElement;
  let defaultError: HTMLElement;
  let restrictionsError: HTMLElement;
  const rerenderRow = () => {
    clear(container);
    populate();
  };
  populate();
  return container;

  function buildDefaultInput(): HTMLElement {
    if (isBooleanType(field.type)) {
      const checkbox = h("input", { type: "checkbox" }) as HTMLInputElement;
      checkbox.checked = field.default === true;
      checkbox.addEventListener("change", () => {
        field.default = checkbox.checked;
      });
      return checkbox;
    }
    if (field.type === "enum") {
      const select = h("select", {}) as HTMLSelectElement;
      select.appendChild(h("option", { value: "" }, "—"));
      for (const opt of field.restrictions.options) {
        const value = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label || opt.value;
        select.appendChild(h("option", { value }, label));
      }
      select.value = typeof field.default === "string" ? field.default : "";
      select.addEventListener("change", () => {
        field.default = select.value;
        updateErrors();
      });
      return select;
    }
    const input = h("input", { type: "text" }) as HTMLInputElement;
    input.value = typeof field.default === "string" ? field.default : "";
    input.addEventListener("input", () => {
      field.default = input.value;
      updateErrors();
    });
    return input;
  }

  function buildRestrictionsSection(): HTMLElement {
    const kinds = restrictionKindsFor(field.type);
    const wrap = h("div", { class: "creator-restrictions" });
    if (kinds.includes("minLength") || kinds.includes("maxLength")) {
      wrap.appendChild(
        h("div", { class: "creator-row-grid" }, [
          labeledTextInput(
            "Min length",
            field.restrictions.minLength,
            (v) => (field.restrictions.minLength = v),
            "number",
          ),
          labeledTextInput(
            "Max length",
            field.restrictions.maxLength,
            (v) => (field.restrictions.maxLength = v),
            "number",
          ),
        ]),
      );
    }
    if (kinds.includes("min") || kinds.includes("max")) {
      wrap.appendChild(
        h("div", { class: "creator-row-grid" }, [
          labeledTextInput(
            "Min",
            field.restrictions.min,
            (v) => (field.restrictions.min = v),
            "number",
          ),
          labeledTextInput(
            "Max",
            field.restrictions.max,
            (v) => (field.restrictions.max = v),
            "number",
          ),
        ]),
      );
    }
    if (kinds.includes("pattern")) {
      wrap.appendChild(
        labeledTextInput(
          "Pattern (regex)",
          field.restrictions.pattern,
          (v) => (field.restrictions.pattern = v),
        ),
      );
      wrap.appendChild(
        labeledTextInput(
          "Pattern error message",
          field.restrictions.patternMessage,
          (v) => (field.restrictions.patternMessage = v),
        ),
      );
    }
    if (kinds.includes("protocols")) {
      wrap.appendChild(
        labeledTextInput(
          "Allowed protocols (comma-separated)",
          field.restrictions.protocols,
          (v) => (field.restrictions.protocols = v),
          "text",
          "https,http",
        ),
      );
    }
    if (kinds.includes("indent")) {
      wrap.appendChild(
        labeledTextInput(
          "Indent (spaces)",
          field.restrictions.indent,
          (v) => (field.restrictions.indent = v),
          "number",
        ),
      );
    }
    if (kinds.includes("options")) {
      wrap.appendChild(buildOptionsEditor());
    }
    return wrap;
  }

  function buildOptionsEditor(): HTMLElement {
    const list = h("div", { class: "creator-options-list" });
    for (const [index, opt] of field.restrictions.options.entries()) {
      const value = typeof opt === "string" ? opt : opt.value;
      const label = typeof opt === "string" ? "" : (opt.label ?? "");
      const valueInput = h("input", { type: "text", placeholder: "value" }) as HTMLInputElement;
      valueInput.value = value;
      const labelInput = h("input", {
        type: "text",
        placeholder: "label (optional)",
      }) as HTMLInputElement;
      labelInput.value = label;
      const commit = () => {
        const opts = field.restrictions.options;
        const next: EnumOption = labelInput.value.trim()
          ? { value: valueInput.value, label: labelInput.value }
          : valueInput.value;
        opts[index] = next;
      };
      valueInput.addEventListener("input", commit);
      labelInput.addEventListener("input", commit);
      list.appendChild(
        h("div", { class: "creator-option-row" }, [
          h("div", { class: "field-control" }, [valueInput]),
          h("div", { class: "field-control" }, [labelInput]),
          h(
            "button",
            {
              type: "button",
              class: "btn btn-ghost btn-small",
              onclick: () => {
                field.restrictions.options = field.restrictions.options.filter(
                  (_, i) => i !== index,
                );
                rerenderRow();
              },
            },
            "Remove",
          ),
        ]),
      );
    }
    list.appendChild(
      h(
        "button",
        {
          type: "button",
          class: "btn btn-ghost btn-small",
          onclick: () => {
            field.restrictions.options = [...field.restrictions.options, ""];
            rerenderRow();
          },
        },
        "+ Add option",
      ),
    );
    return list;
  }

  function labeledTextInput(
    labelText: string,
    value: string,
    onChange: (value: string) => void,
    type = "text",
    placeholder = "",
  ): HTMLElement {
    const input = h("input", { type, placeholder }) as HTMLInputElement;
    input.value = value;
    input.addEventListener("input", () => {
      onChange(input.value);
      updateErrors();
    });
    return h("div", { class: "field-control" }, [h("label", {}, labelText), input]);
  }

  function updateErrors(): void {
    const errors = validateDraftField(field, draft.fields);
    setFieldError(keyError, errors.key);
    setFieldError(defaultError, errors.default);
    setFieldError(restrictionsError, errors.restrictions);
  }

  function populate(): void {
    const keyInput = h("input", { type: "text" }) as HTMLInputElement;
    keyInput.value = field.key;
    keyInput.addEventListener("input", () => {
      field.key = keyInput.value;
      updateErrors();
      refreshIssues();
    });

    const nameInput = h("input", { type: "text" }) as HTMLInputElement;
    nameInput.value = field.name;
    nameInput.addEventListener("input", () => {
      field.name = nameInput.value;
    });

    const typeSelect = h("select", {}) as HTMLSelectElement;
    for (const t of FIELD_TYPES)
      typeSelect.appendChild(h("option", { value: t }, fieldTypeLabel(t)));
    typeSelect.value = field.type;
    typeSelect.addEventListener("change", () => {
      field.type = typeSelect.value as FieldType;
      field.default = isBooleanType(field.type) ? false : "";
      rerenderRow();
      refreshIssues();
    });

    const requiredCheckbox = h("input", { type: "checkbox" }) as HTMLInputElement;
    requiredCheckbox.checked = field.required;
    requiredCheckbox.addEventListener("change", () => {
      field.required = requiredCheckbox.checked;
    });
    const requiredLabel = h("label", { class: "creator-inline-checkbox" }, [
      requiredCheckbox,
      "Required",
    ]);

    const descInput = h("input", { type: "text" }) as HTMLInputElement;
    descInput.value = field.description;
    descInput.addEventListener("input", () => {
      field.description = descInput.value;
    });

    const defaultInput = buildDefaultInput();

    keyError = h("p", { class: "field-error", hidden: true });
    defaultError = h("p", { class: "field-error", hidden: true });
    restrictionsError = h("p", { class: "field-error", hidden: true });

    container.append(
      h("div", { class: "creator-row-grid" }, [
        h("div", { class: "field-control" }, [h("label", {}, "Key"), keyInput]),
        h("div", { class: "field-control" }, [h("label", {}, "Label"), nameInput]),
        h("div", { class: "field-control" }, [h("label", {}, "Type"), typeSelect]),
        requiredLabel,
      ]),
      keyError,
      h("div", { class: "field-control" }, [h("label", {}, "Default value"), defaultInput]),
      defaultError,
      h("div", { class: "field-control" }, [h("label", {}, "Description"), descInput]),
      buildRestrictionsSection(),
      restrictionsError,
      h("div", { class: "creator-row-actions" }, [
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost btn-small",
            onclick: () => removeVariable(field),
          },
          "Remove variable",
        ),
      ]),
    );
    updateErrors();
  }
}

dom.btnAddVariable.addEventListener("click", () => {
  draft.fields = [...draft.fields, newDraftField(draft.fields)];
  renderVariables();
});

// ---------- Files ----------
// Keys are fixed to CLOUD_INIT_FILE_KEYS (the only filenames cloud-init's NoCloud/
// ConfigDrive datasource actually reads), each offered once via the "+ Add ..." buttons
// below — so a file row only ever needs to edit its content.

function renderAddFileActions(): void {
  clear(dom.addFileActions);
  for (const key of availableFileKeys(draft.files)) {
    dom.addFileActions.appendChild(
      h(
        "button",
        {
          type: "button",
          class: "btn btn-ghost",
          onclick: () => {
            draft.files = [...draft.files, newDraftFile(key)];
            renderFiles();
          },
        },
        `+ Add ${key}`,
      ),
    );
  }
}

function renderFiles(): void {
  clear(dom.filesList);
  if (!draft.files.length) {
    dom.filesList.appendChild(
      h("p", { class: "empty-state" }, "No files yet. Use one of the buttons above to add one."),
    );
  }
  // Keep files in the same fixed order regardless of the order they were added in.
  const ordered = [...draft.files].sort(
    (a, b) => CLOUD_INIT_FILE_KEYS.indexOf(a.key) - CLOUD_INIT_FILE_KEYS.indexOf(b.key),
  );
  for (const file of ordered) {
    dom.filesList.appendChild(createFileRow(file));
  }
  renderAddFileActions();
  refreshIssues();
  refreshPreviewCards();
}

function removeFile(file: DraftFile): void {
  draft.files = draft.files.filter((f) => f !== file);
  renderFiles();
}

function createFileRow(file: DraftFile): HTMLElement {
  const container = h("div", { class: "field creator-row" });

  const contentTextarea = h("textarea", { rows: "12" }) as HTMLTextAreaElement;
  contentTextarea.value = file.content;
  const contentError = h("p", { class: "field-error", hidden: true });

  function updateErrors(): void {
    setFieldError(contentError, validateDraftFile(file).content);
  }

  contentTextarea.addEventListener("input", () => {
    file.content = contentTextarea.value;
    updateErrors();
    refreshIssues();
    refreshPreviewCards();
  });

  container.append(
    h("h4", {}, file.key),
    h("div", { class: "field-control" }, [
      h("label", {}, "Content (YAML, use __key__ placeholders)"),
      contentTextarea,
    ]),
    contentError,
    h("div", { class: "creator-row-actions" }, [
      h(
        "button",
        {
          type: "button",
          class: "btn btn-ghost btn-small",
          onclick: () => removeFile(file),
        },
        "Remove file",
      ),
    ]),
  );
  updateErrors();
  return container;
}

// ---------- Open (resume editing an existing template) ----------

function draftIsEmpty(): boolean {
  return (
    !draft.name.trim() &&
    !draft.author.trim() &&
    !draft.version.trim() &&
    !draft.icon.trim() &&
    draft.fields.length === 0 &&
    draft.files.length === 0
  );
}

function applyLoadedDraft(loaded: DraftTemplate): void {
  draft.name = loaded.name;
  draft.author = loaded.author;
  draft.version = loaded.version;
  draft.fields = loaded.fields;
  draft.files = loaded.files;

  dom.nameInput.value = draft.name;
  dom.authorInput.value = draft.author;
  dom.versionInput.value = draft.version;
  setIcon(loaded.icon);

  renderVariables();
  renderFiles();
  refreshMetaErrors();
  // Resuming an existing template usually means the details are already right —
  // collapse them so there's more room for the variables/files you're here to edit.
  setMetaCollapsed(true);
}

async function notice(title: string, message: string, danger = false): Promise<void> {
  await confirmDialog({ title, message, confirmText: "OK", cancelText: "OK", danger });
}

dom.btnOpenTemplate.addEventListener("click", () => dom.openTemplateInput.click());
dom.openTemplateInput.addEventListener("change", async () => {
  const file = dom.openTemplateInput.files?.[0];
  dom.openTemplateInput.value = "";
  if (!file) return;

  if (!draftIsEmpty()) {
    const proceed = await confirmDialog({
      title: "Replace current draft?",
      message: "Opening a template replaces what you've entered here. This can't be undone.",
      confirmText: "Open anyway",
      danger: true,
    });
    if (!proceed) return;
  }

  let parsed: unknown;
  try {
    const text = await file.text();
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`Not valid JSON (${(err as Error).message}).`);
    }
    const shapeErrors = validateTemplateShape(parsed);
    if (shapeErrors.length) throw new Error(shapeErrors.join(" "));
  } catch (err) {
    await notice("Could not open this file", (err as Error).message, true);
    return;
  }

  const { draft: loaded, warnings } = draftFromTemplate(parsed as Template);
  applyLoadedDraft(loaded);
  if (warnings.length) {
    await notice("Imported with some caveats", warnings.join(" "));
  }
});

// ---------- Export ----------

async function confirmIfBlocking(): Promise<boolean> {
  if (!hasBlockingIssues(draft)) return true;
  return confirmDialog({
    title: "This template has validation issues",
    message:
      "Some fields are invalid or incomplete, or a file uses an undefined variable. The exported JSON may not work correctly.",
    confirmText: "Continue anyway",
    danger: true,
  });
}

dom.btnCopyJson.addEventListener("click", async () => {
  if (!(await confirmIfBlocking())) return;
  await copyText(JSON.stringify(buildTemplate(draft), null, 2));
  flash(dom.btnCopyJson, "Copied");
});

dom.btnSaveJson.addEventListener("click", async () => {
  if (!(await confirmIfBlocking())) return;
  downloadFile(`${slugify(draft.name)}.json`, JSON.stringify(buildTemplate(draft), null, 2));
  flash(dom.btnSaveJson, "Saved");
});

renderVariables();
renderFiles();
refreshMetaErrors();

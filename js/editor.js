import { confirmDialog } from "./confirm.js";
import { clear, h, linkifyContact } from "./dom.js";
import {
  copyBase64,
  copyText,
  downloadFile,
  isDirectoryPickerSupported,
  replaceOnDisk,
} from "./export.js";
import {
  getDedupedFields,
  getSubTemplateFilename,
  initialValuesFor,
  renderContent,
} from "./templater.js";
import { getFieldTypeInfo, validateField } from "./validators.js";

// Chrome/Firefox/Safari largely ignore a plain autocomplete="off" on password fields
// (they still offer to save/fill credentials), but "new-password" is the value they
// actually respect for a field that isn't a real login form.
function autocompleteFor(kind) {
  return kind === "password" ? "new-password" : "off";
}

// Browsers now compile the HTML `pattern` attribute with the stricter `v` (unicode sets)
// regex flag, which rejects some patterns that are perfectly valid as a plain RegExp (e.g.
// an unescaped trailing "-" in a character class can trip it). Our own validateField() call
// already enforces the pattern in JS regardless, so if it isn't safe under `v` we simply
// skip the native attribute rather than let the browser log a console error.
function isSafeHtmlPattern(pattern) {
  try {
    new RegExp(pattern, "v");
    return true;
  } catch {
    return false;
  }
}

function buildInput(field, initialValue) {
  const typeInfo = getFieldTypeInfo(field.type);
  const kind = typeInfo?.inputKind || "text";
  const id = `field-${field.key}`;
  const autocomplete = autocompleteFor(kind);
  let input;

  if (kind === "textarea") {
    input = h("textarea", {
      id,
      autocomplete,
      rows: String(typeInfo.rows || 3),
      placeholder: typeInfo.placeholder || "",
    });
    input.value = initialValue ?? "";
  } else if (kind === "select") {
    input = h("select", { id, autocomplete });
    const options = field.restrictions?.options || [];
    if (field.required === false)
      input.appendChild(h("option", { value: "" }, "—"));
    for (const opt of options) {
      const value = typeof opt === "string" ? opt : opt.value;
      const label = typeof opt === "string" ? opt : opt.label || opt.value;
      input.appendChild(h("option", { value }, label));
    }
    input.value = initialValue ?? "";
  } else if (kind === "checkbox") {
    input = h("input", { type: "checkbox", id, autocomplete: "off" });
    input.checked = Boolean(initialValue);
  } else if (kind === "number") {
    const attrs = { type: "number", id, autocomplete };
    if (field.restrictions?.min != null) attrs.min = field.restrictions.min;
    if (field.restrictions?.max != null) attrs.max = field.restrictions.max;
    input = h("input", attrs);
    input.value = initialValue ?? "";
  } else if (
    kind === "date" ||
    kind === "datetime-local" ||
    kind === "password"
  ) {
    input = h("input", { type: kind, id, autocomplete });
    input.value = initialValue ?? "";
  } else {
    const attrs = {
      type: "text",
      id,
      autocomplete,
      placeholder: typeInfo?.placeholder || "",
    };
    if (field.restrictions?.maxLength != null)
      attrs.maxlength = field.restrictions.maxLength;
    if (
      field.restrictions?.pattern &&
      isSafeHtmlPattern(field.restrictions.pattern)
    ) {
      attrs.pattern = field.restrictions.pattern;
    }
    input = h("input", attrs);
    input.value = initialValue ?? "";
  }
  return { input, kind };
}

function buildFieldRow(field, initialValue, onChange) {
  const { input, kind } = buildInput(field, initialValue);
  const errorEl = h("p", { class: "field-error", hidden: true });

  const changeEvent =
    kind === "select" || kind === "checkbox" ? "change" : "input";
  input.addEventListener(changeEvent, () => {
    onChange(kind === "checkbox" ? input.checked : input.value);
  });

  const label = h("label", { for: input.id }, [
    field.name || field.key,
    field.required === false
      ? h("span", { class: "muted" }, " (optional)")
      : h("span", { class: "required-mark" }, " *"),
  ]);

  const controls = [input];
  if (field.type === "uuid") {
    controls.push(
      h(
        "button",
        {
          type: "button",
          class: "btn btn-ghost btn-small",
          onclick: () => {
            const val = crypto.randomUUID();
            input.value = val;
            onChange(val);
          },
        },
        "Generate",
      ),
    );
  }

  const rowChildren = [label];
  if (field.description)
    rowChildren.push(h("p", { class: "field-help" }, field.description));
  rowChildren.push(h("div", { class: "field-control" }, controls), errorEl);

  const row = h("div", { class: "field" }, rowChildren);
  return { row, input, errorEl, kind };
}

export function mountEditor(refs, selection) {
  const { template } = selection;
  const fields = getDedupedFields(template);
  const values = initialValuesFor(fields);
  const errors = {};
  const previewEls = {};
  const fieldRows = {};

  refs.titleEl.textContent = template.name || "(unnamed template)";
  clear(refs.metaEl);
  if (template.version)
    refs.metaEl.appendChild(document.createTextNode(`v${template.version}`));
  if (template.author) {
    if (template.version)
      refs.metaEl.appendChild(document.createTextNode(" · "));
    refs.metaEl.appendChild(linkifyContact(template.author));
  }
  if (
    typeof template.icon === "string" &&
    /^data:image\//.test(template.icon)
  ) {
    refs.iconEl.src = template.icon;
    refs.iconEl.hidden = false;
  } else {
    refs.iconEl.removeAttribute("src");
    refs.iconEl.hidden = true;
  }

  clear(refs.formEl);
  clear(refs.previewCardsEl);

  function updateAllPreviews() {
    for (const key of Object.keys(template.templates)) {
      previewEls[key].textContent = renderContent(
        template.templates[key].content,
        fields,
        values,
      );
    }
  }

  function handleFieldChange(field, rawValue) {
    values[field.key] = rawValue;
    const result = validateField(field, rawValue);
    errors[field.key] = result.valid ? null : result.message;
    const built = fieldRows[field.key];
    built.row.classList.toggle("invalid", !result.valid);
    built.errorEl.textContent = result.message || "";
    built.errorEl.hidden = result.valid;
    updateAllPreviews();
  }

  if (!fields.length) {
    refs.formEl.appendChild(
      h(
        "p",
        { class: "empty-state" },
        "This template has no configurable fields.",
      ),
    );
  }

  for (const field of fields) {
    const built = buildFieldRow(field, values[field.key], (val) =>
      handleFieldChange(field, val),
    );
    fieldRows[field.key] = built;
    refs.formEl.appendChild(built.row);
    const actual =
      built.kind === "checkbox" ? built.input.checked : built.input.value;
    values[field.key] = actual;
    const initial = validateField(field, actual);
    errors[field.key] = initial.valid ? null : initial.message;
  }

  for (const [key, sub] of Object.entries(template.templates)) {
    const filename = getSubTemplateFilename(key, sub);
    const pre = h("pre", { class: "preview-content" });
    previewEls[key] = pre;
    const card = h("article", { class: "preview-card" }, [
      h("div", { class: "preview-card-header" }, [
        h("h4", {}, filename),
        key !== filename ? h("span", { class: "muted" }, key) : null,
      ]),
      pre,
      h("div", { class: "preview-card-actions" }, [
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost btn-small",
            onclick: () =>
              copyText(pre.textContent).then(() => flash(card, "Copied")),
          },
          "Copy text",
        ),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost btn-small",
            onclick: () =>
              copyBase64(pre.textContent).then(() => flash(card, "Copied")),
          },
          "Copy base64",
        ),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-ghost btn-small",
            onclick: () => downloadFile(filename, pre.textContent),
          },
          "Save to disk",
        ),
      ]),
    ]);
    refs.previewCardsEl.appendChild(card);
  }

  updateAllPreviews();

  refs.replaceHintEl.textContent = isDirectoryPickerSupported()
    ? ""
    : 'Not supported in this browser — use "Save to disk" per file instead.';
  refs.replaceBtn.disabled = !isDirectoryPickerSupported();
  refs.replaceBtn.onclick = async () => {
    const invalidRequired = fields.filter(
      (f) => f.required !== false && errors[f.key],
    );
    if (invalidRequired.length) {
      const proceed = await confirmDialog({
        title: "Some required fields are incomplete",
        message: `${invalidRequired.length} required field(s) are empty or invalid (${invalidRequired
          .map((f) => f.name || f.key)
          .join(", ")}). Writing now may produce a broken configuration.`,
        confirmText: "Continue anyway",
        danger: true,
      });
      if (!proceed) return;
    }
    const files = Object.entries(template.templates).map(([key, sub]) => ({
      filename: getSubTemplateFilename(key, sub),
      content: previewEls[key].textContent,
    }));
    try {
      const result = await replaceOnDisk(files);
      refs.replaceHintEl.textContent = result.cancelled
        ? "Cancelled."
        : `Wrote ${result.written.length} file(s) to "${result.directoryName}".`;
    } catch (err) {
      refs.replaceHintEl.textContent = err.message;
    }
  };
}

function flash(card, text) {
  const note = h("span", { class: "flash-note" }, text);
  card.appendChild(note);
  setTimeout(() => note.remove(), 1200);
}

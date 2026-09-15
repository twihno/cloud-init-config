// Template shape helpers: field de-duplication, `__key__` substitution, and
// a light-weight structural check used before we trust an imported/fetched template.

export function validateTemplateShape(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") return ["Not a JSON object."];
  if (typeof obj.name !== "string" || !obj.name.trim())
    errors.push('Missing "name" (string).');
  if (
    obj.templates == null ||
    typeof obj.templates !== "object" ||
    Array.isArray(obj.templates)
  ) {
    errors.push('Missing "templates" (object of sub-templates).');
    return errors;
  }
  const keys = Object.keys(obj.templates);
  if (!keys.length) errors.push('"templates" must contain at least one entry.');
  for (const key of keys) {
    const sub = obj.templates[key];
    if (!sub || typeof sub.content !== "string") {
      errors.push(`templates.${key}: missing "content" (string).`);
      continue;
    }
    if (sub.fields && !Array.isArray(sub.fields)) {
      errors.push(`templates.${key}: "fields" must be an array.`);
      continue;
    }
    for (const field of sub.fields || []) {
      if (!field || typeof field.key !== "string" || !field.key) {
        errors.push(`templates.${key}: a field is missing "key".`);
      }
      if (!field || typeof field.type !== "string" || !field.type) {
        errors.push(
          `templates.${key}: field "${field?.key}" is missing "type".`,
        );
      }
    }
  }
  return errors;
}

// Fields that share a `key` across multiple sub-templates are asked once and reused
// everywhere; this returns that de-duplicated list in first-seen order.
export function getDedupedFields(template) {
  const seen = new Map();
  for (const sub of Object.values(template.templates || {})) {
    for (const field of sub.fields || []) {
      if (!seen.has(field.key)) seen.set(field.key, field);
    }
  }
  return [...seen.values()];
}

export function getSubTemplateFilename(key, sub) {
  return sub.filename || key;
}

export function formatFieldValue(field, rawValue) {
  const value =
    rawValue === undefined || rawValue === ""
      ? (field.default ?? "")
      : rawValue;
  if (field.type === "ssh-pubkey-list") {
    const indent = " ".repeat(field.restrictions?.indent ?? 0);
    return String(value)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `${indent}- ${l}`)
      .join("\n");
  }
  if (field.type === "bool") {
    return String(value === true || value === "true");
  }
  return String(value);
}

export function renderContent(content, fields, values) {
  let out = content;
  for (const field of fields) {
    const formatted = formatFieldValue(field, values[field.key]);
    out = out.replaceAll(`__${field.key}__`, formatted);
  }
  return out;
}

export function initialValuesFor(fields) {
  const values = {};
  for (const field of fields) {
    values[field.key] =
      field.type === "bool" ? Boolean(field.default) : (field.default ?? "");
  }
  return values;
}

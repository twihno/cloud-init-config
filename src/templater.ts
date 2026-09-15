// Template shape helpers: field de-duplication, `__key__` substitution, and
// a light-weight structural check used before we trust an imported/fetched template.
import type { SubTemplate, Template, TemplateField } from "@/types.ts";

export function validateTemplateShape(obj: unknown): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== "object") return ["Not a JSON object."];
  const rec = obj as Record<string, unknown>;
  if (typeof rec.name !== "string" || !rec.name.trim()) errors.push('Missing "name" (string).');
  if (rec.templates == null || typeof rec.templates !== "object" || Array.isArray(rec.templates)) {
    errors.push('Missing "templates" (object of sub-templates).');
    return errors;
  }
  const templates = rec.templates as Record<string, unknown>;
  const keys = Object.keys(templates);
  if (!keys.length) errors.push('"templates" must contain at least one entry.');
  for (const key of keys) {
    const sub = templates[key] as Record<string, unknown> | null;
    if (!sub || typeof sub.content !== "string") {
      errors.push(`templates.${key}: missing "content" (string).`);
      continue;
    }
    if (sub.fields && !Array.isArray(sub.fields)) {
      errors.push(`templates.${key}: "fields" must be an array.`);
      continue;
    }
    for (const field of (sub.fields as Array<Record<string, unknown>>) || []) {
      const fieldKey = typeof field?.key === "string" ? field.key : "";
      if (!field || typeof field.key !== "string" || !field.key) {
        errors.push(`templates.${key}: a field is missing "key".`);
      }
      if (!field || typeof field.type !== "string" || !field.type) {
        errors.push(`templates.${key}: field "${fieldKey}" is missing "type".`);
      }
    }
  }
  return errors;
}

// Fields that share a `key` across multiple sub-templates are asked once and reused
// everywhere; this returns that de-duplicated list in first-seen order.
export function getDedupedFields(template: Template): TemplateField[] {
  const seen = new Map<string, TemplateField>();
  for (const sub of Object.values(template.templates || {})) {
    for (const field of sub.fields || []) {
      if (!seen.has(field.key)) seen.set(field.key, field);
    }
  }
  return [...seen.values()];
}

export function getSubTemplateFilename(key: string, sub: SubTemplate): string {
  return sub.filename || key;
}

export type FieldValues = Record<string, string | boolean>;

export function formatFieldValue(
  field: TemplateField,
  rawValue: string | boolean | undefined,
): string {
  const value = rawValue === undefined || rawValue === "" ? (field.default ?? "") : rawValue;
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

export function renderContent(
  content: string,
  fields: TemplateField[],
  values: FieldValues,
): string {
  let out = content;
  for (const field of fields) {
    const formatted = formatFieldValue(field, values[field.key]);
    out = out.replaceAll(`__${field.key}__`, formatted);
  }
  return out;
}

export function initialValuesFor(fields: TemplateField[]): FieldValues {
  const values: FieldValues = {};
  for (const field of fields) {
    values[field.key] = field.type === "bool" ? Boolean(field.default) : (field.default ?? "");
  }
  return values;
}

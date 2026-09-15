// Pure model/validation/build logic for the "New template" creator (src/new-main.ts
// wires this up to the DOM). Kept framework/DOM-free so the rules here mirror
// TEMPLATE_SCHEMA.md exactly and stay easy to reason about in isolation.
import { load as parseYaml } from "js-yaml";
import { getDedupedFields } from "@/templater.ts";
import { VALIDATORS } from "@/validators.ts";
import type {
  EnumOption,
  FieldRestrictions,
  FieldType,
  SubTemplate,
  Template,
  TemplateField,
} from "@/types.ts";

// ---------- Draft model ----------
// Restrictions are kept as raw strings (as typed into <input>s) regardless of the
// field's current type, so switching a field's type back and forth doesn't lose what
// was typed into a restriction that isn't relevant right now. They're parsed and
// pruned to what the type actually uses only at export time (see exportRestrictions).

export interface DraftRestrictions {
  minLength: string;
  maxLength: string;
  pattern: string;
  patternMessage: string;
  min: string;
  max: string;
  protocols: string;
  indent: string;
  options: EnumOption[];
}

export interface DraftField {
  key: string;
  name: string;
  type: FieldType;
  required: boolean;
  default: string | boolean;
  description: string;
  restrictions: DraftRestrictions;
}

// cloud-init's NoCloud/ConfigDrive datasource only ever reads these exact filenames
// off the boot partition — anything else is just inert data cloud-init won't look at,
// so the creator only lets you author these (see also CLASSIC_CLOUD_INIT_FILES in
// export.ts, which already assumes the same three for its boot-partition sanity check).
export const CLOUD_INIT_FILE_KEYS = ["user-data", "meta-data", "network-config"] as const;
export type CloudInitFileKey = (typeof CLOUD_INIT_FILE_KEYS)[number];

export interface DraftFile {
  key: CloudInitFileKey;
  content: string;
}

export interface DraftTemplate {
  name: string;
  author: string;
  version: string;
  icon: string;
  fields: DraftField[];
  files: DraftFile[];
}

export function emptyRestrictions(): DraftRestrictions {
  return {
    minLength: "",
    maxLength: "",
    pattern: "",
    patternMessage: "",
    min: "",
    max: "",
    protocols: "",
    indent: "",
    options: [],
  };
}

export function emptyDraft(): DraftTemplate {
  return { name: "", author: "", version: "", icon: "", fields: [], files: [] };
}

let nextId = 1;
// Auto-generated keys ("variable_1", "variable_2", ...) for freshly added variable rows
// — always unique against what's already in `existing`, cheap insurance against silent
// key-collision export bugs while the user is still naming things.
function nextUniqueFieldKey(existing: DraftField[]): string {
  const used = new Set(existing.map((e) => e.key));
  let key = `variable_${nextId}`;
  while (used.has(key)) {
    nextId += 1;
    key = `variable_${nextId}`;
  }
  nextId += 1;
  return key;
}

export function newDraftField(existing: DraftField[]): DraftField {
  return {
    key: nextUniqueFieldKey(existing),
    name: "",
    type: "string",
    required: true,
    default: "",
    description: "",
    restrictions: emptyRestrictions(),
  };
}

export function availableFileKeys(existing: DraftFile[]): CloudInitFileKey[] {
  const used = new Set(existing.map((f) => f.key));
  return CLOUD_INIT_FILE_KEYS.filter((k) => !used.has(k));
}

export function newDraftFile(key: CloudInitFileKey): DraftFile {
  return { key, content: "" };
}

// ---------- Field type metadata for the UI ----------

export const FIELD_TYPES = Object.keys(VALIDATORS) as FieldType[];

export function fieldTypeLabel(type: FieldType): string {
  return VALIDATORS[type]?.label ?? type;
}

type RestrictionKind =
  | "minLength"
  | "maxLength"
  | "pattern"
  | "min"
  | "max"
  | "protocols"
  | "indent"
  | "options";

const RESTRICTIONS_BY_TYPE: Partial<Record<FieldType, RestrictionKind[]>> = {
  string: ["minLength", "maxLength", "pattern"],
  text: ["minLength", "maxLength", "pattern"],
  password: ["minLength", "maxLength", "pattern"],
  int: ["min", "max"],
  float: ["min", "max"],
  "unix-timestamp": ["min", "max"],
  enum: ["options"],
  url: ["protocols"],
  "ssh-pubkey-list": ["indent"],
};

export function restrictionKindsFor(type: FieldType): RestrictionKind[] {
  return RESTRICTIONS_BY_TYPE[type] ?? [];
}

// Whether `type` renders its "default value" input as a checkbox rather than a text
// control — the only type where `default` isn't a string in the exported schema.
export function isBooleanType(type: FieldType): boolean {
  return type === "bool";
}

function exportRestrictions(type: FieldType, r: DraftRestrictions): FieldRestrictions | undefined {
  const kinds = restrictionKindsFor(type);
  const out: FieldRestrictions = {};
  if (kinds.includes("minLength") && r.minLength.trim() !== "") out.minLength = Number(r.minLength);
  if (kinds.includes("maxLength") && r.maxLength.trim() !== "") out.maxLength = Number(r.maxLength);
  if (kinds.includes("pattern") && r.pattern.trim()) {
    out.pattern = r.pattern.trim();
    if (r.patternMessage.trim()) out.patternMessage = r.patternMessage.trim();
  }
  if (kinds.includes("min") && r.min.trim() !== "") out.min = Number(r.min);
  if (kinds.includes("max") && r.max.trim() !== "") out.max = Number(r.max);
  if (kinds.includes("protocols") && r.protocols.trim()) {
    out.protocols = r.protocols
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }
  if (kinds.includes("indent") && r.indent.trim() !== "") out.indent = Number(r.indent);
  if (kinds.includes("options") && r.options.length) out.options = r.options;
  return Object.keys(out).length ? out : undefined;
}

// ---------- Format validation (semver, author, icon) ----------

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTHOR_RE = /^[^<>]+\s<([^\s<>]+)>$/;
// Standard semver.org grammar (major.minor.patch, optional -prerelease and +build).
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const ICON_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function isValidAuthor(value: string): boolean {
  const m = AUTHOR_RE.exec(value.trim());
  return m ? EMAIL_RE.test(m[1]) : false;
}

export function isValidSemver(value: string): boolean {
  return SEMVER_RE.test(value.trim());
}

export function isValidIconDataUri(value: string): boolean {
  return ICON_RE.test(value.trim());
}

// content is only ever __key__-substituted YAML, so this both catches typos and
// gives real-time confidence that the file is well-formed cloud-init YAML.
export function yamlSyntaxError(content: string): string | null {
  if (!content.trim()) return null;
  try {
    parseYaml(content);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// ---------- Per-row validation ----------

export interface MetaErrors {
  name?: string;
  author?: string;
  version?: string;
  icon?: string;
}

export function validateMeta(draft: DraftTemplate): MetaErrors {
  const errors: MetaErrors = {};
  if (!draft.name.trim()) errors.name = "Name is required.";
  if (draft.author.trim() && !isValidAuthor(draft.author))
    errors.author = 'Must look like "Name <email@example.com>".';
  if (draft.version.trim() && !isValidSemver(draft.version))
    errors.version = "Must be a valid semantic version, e.g. 1.0.0.";
  if (draft.icon.trim() && !isValidIconDataUri(draft.icon))
    errors.icon = "Must be a data:image/...;base64,... URI.";
  return errors;
}

export interface FieldRowErrors {
  key?: string;
  default?: string;
  restrictions?: string;
}

export function validateDraftField(field: DraftField, allFields: DraftField[]): FieldRowErrors {
  const errors: FieldRowErrors = {};
  const key = field.key.trim();
  if (!key) {
    errors.key = "Key is required.";
  } else if (!isValidKey(key)) {
    errors.key =
      "Must start with a letter or underscore, and contain only letters, digits, and underscores.";
  } else if (allFields.filter((f) => f.key.trim() === key).length > 1) {
    errors.key = "Key must be unique.";
  }

  if (field.type === "enum" && field.restrictions.options.length === 0) {
    errors.restrictions = "Add at least one option.";
  } else if (field.type === "int" || field.type === "float" || field.type === "unix-timestamp") {
    const min = field.restrictions.min.trim() !== "" ? Number(field.restrictions.min) : null;
    const max = field.restrictions.max.trim() !== "" ? Number(field.restrictions.max) : null;
    if (min != null && max != null && min > max)
      errors.restrictions = "Min must be less than or equal to max.";
  } else if (["string", "text", "password"].includes(field.type)) {
    const min =
      field.restrictions.minLength.trim() !== "" ? Number(field.restrictions.minLength) : null;
    const max =
      field.restrictions.maxLength.trim() !== "" ? Number(field.restrictions.maxLength) : null;
    if (min != null && max != null && min > max)
      errors.restrictions = "Min length must be less than or equal to max length.";
  }

  const defaultValue = typeof field.default === "boolean" ? field.default : field.default.trim();
  if (!isBooleanType(field.type) && defaultValue !== "") {
    const info = VALIDATORS[field.type];
    const restrictions = exportRestrictions(field.type, field.restrictions) ?? {};
    const result = info.validate(String(defaultValue), restrictions);
    if (!result.valid) errors.default = result.message || "Invalid default value.";
  }
  return errors;
}

export interface FileRowErrors {
  content?: string;
}

// File keys are picked from CLOUD_INIT_FILE_KEYS and each offered only once (see
// availableFileKeys), so they can't be empty, invalid, or duplicated by construction —
// only the content needs validating here.
export function validateDraftFile(file: DraftFile): FileRowErrors {
  const errors: FileRowErrors = {};
  if (!file.content.trim()) {
    errors.content = "Content is required.";
  } else {
    const yamlError = yamlSyntaxError(file.content);
    if (yamlError) errors.content = `Invalid YAML: ${yamlError}`;
  }
  return errors;
}

// ---------- Cross-file validation: __key__ usage vs. defined variables ----------

// Heuristic extraction only (the actual substitution in templater.ts is a literal,
// per-known-key replaceAll) — good enough to flag typos and unused variables.
const TOKEN_RE = /__([A-Za-z_][A-Za-z0-9_]*)__/g;

export function extractUsedKeys(content: string): Set<string> {
  const keys = new Set<string>();
  for (const m of content.matchAll(TOKEN_RE)) keys.add(m[1]);
  return keys;
}

export interface CrossIssue {
  level: "error" | "info";
  message: string;
}

export function crossValidate(draft: DraftTemplate): CrossIssue[] {
  const issues: CrossIssue[] = [];
  const definedKeys = new Set(draft.fields.map((f) => f.key.trim()).filter(Boolean));
  const usedKeys = new Set<string>();
  for (const file of draft.files) {
    const used = extractUsedKeys(file.content);
    for (const key of used) {
      usedKeys.add(key);
      if (!definedKeys.has(key)) {
        issues.push({
          level: "error",
          message: `"${file.key}" uses __${key}__, which is not defined as a variable.`,
        });
      }
    }
  }
  for (const key of definedKeys) {
    if (!usedKeys.has(key)) {
      issues.push({ level: "info", message: `Variable "${key}" is not used in any file.` });
    }
  }
  return issues;
}

export function hasBlockingIssues(draft: DraftTemplate): boolean {
  if (Object.keys(validateMeta(draft)).length) return true;
  if (!draft.files.length) return true;
  for (const f of draft.fields) {
    if (Object.keys(validateDraftField(f, draft.fields)).length) return true;
  }
  for (const file of draft.files) {
    if (Object.keys(validateDraftFile(file)).length) return true;
  }
  return crossValidate(draft).some((i) => i.level === "error");
}

// ---------- Export ----------

export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "template";
}

function toTemplateField(f: DraftField): TemplateField {
  const key = f.key.trim();
  const out = {} as TemplateField;
  if (f.name.trim()) out.name = f.name.trim();
  out.key = key;
  out.type = f.type;
  if (f.required === false) out.required = false;
  if (isBooleanType(f.type)) {
    if (f.default === true) out.default = true;
  } else if (typeof f.default === "string" && f.default.trim()) {
    out.default = f.default.trim();
  }
  if (f.description.trim()) out.description = f.description.trim();
  const restrictions = exportRestrictions(f.type, f.restrictions);
  if (restrictions) out.restrictions = restrictions;
  return out;
}

// Every sub-template only gets the variables it actually references (matching how
// hand-written templates like templates/raspberry1.json scope `fields` per file) —
// the app's own getDedupedFields() then reunites them into one shared form.
export function buildTemplate(draft: DraftTemplate): Template {
  const templates: Record<string, SubTemplate> = {};
  for (const file of draft.files) {
    const used = extractUsedKeys(file.content);
    const fields = draft.fields
      .filter((f) => f.key.trim() && used.has(f.key.trim()))
      .map(toTemplateField);
    const sub: SubTemplate = { content: file.content };
    if (fields.length) sub.fields = fields;
    templates[file.key] = sub;
  }
  const template = {} as Template;
  template.name = draft.name.trim();
  if (draft.author.trim()) template.author = draft.author.trim();
  if (draft.version.trim()) template.version = draft.version.trim();
  if (draft.icon.trim()) template.icon = draft.icon.trim();
  template.templates = templates;
  return template;
}

// ---------- Import (resume editing an existing template) ----------

function draftRestrictionsFrom(r: FieldRestrictions | undefined): DraftRestrictions {
  const out = emptyRestrictions();
  if (!r) return out;
  if (r.minLength != null) out.minLength = String(r.minLength);
  if (r.maxLength != null) out.maxLength = String(r.maxLength);
  if (r.pattern != null) out.pattern = r.pattern;
  if (r.patternMessage != null) out.patternMessage = r.patternMessage;
  if (r.min != null) out.min = String(r.min);
  if (r.max != null) out.max = String(r.max);
  if (r.protocols != null) out.protocols = r.protocols.join(",");
  if (r.indent != null) out.indent = String(r.indent);
  if (r.options != null) out.options = r.options;
  return out;
}

function draftFieldFrom(f: TemplateField): DraftField {
  return {
    key: f.key,
    name: f.name ?? "",
    type: f.type,
    required: f.required !== false,
    default: isBooleanType(f.type)
      ? f.default === true
      : typeof f.default === "string"
        ? f.default
        : "",
    description: f.description ?? "",
    restrictions: draftRestrictionsFrom(f.restrictions),
  };
}

export interface ImportResult {
  draft: DraftTemplate;
  warnings: string[];
}

// The inverse of buildTemplate(): reconstructs a draft good enough to keep editing.
// Variables come back deduped exactly the way the app's own runtime editor sees them
// (getDedupedFields), so re-exporting an untouched import round-trips losslessly. Any
// sub-template whose actual output filename isn't one of CLOUD_INIT_FILE_KEYS can't be
// represented by the creator's fixed file slots and is dropped, with a warning —
// hand-written templates aren't restricted to those three (see TEMPLATE_SCHEMA.md).
export function draftFromTemplate(template: Template): ImportResult {
  const warnings: string[] = [];
  const fields = getDedupedFields(template).map(draftFieldFrom);

  const files: DraftFile[] = [];
  const seen = new Set<string>();
  for (const [key, sub] of Object.entries(template.templates || {})) {
    const resolvedName = sub.filename || key;
    if (!(CLOUD_INIT_FILE_KEYS as readonly string[]).includes(resolvedName)) {
      warnings.push(
        `Skipped "${key}" — its output filename ("${resolvedName}") isn't one of ${CLOUD_INIT_FILE_KEYS.join(", ")}.`,
      );
      continue;
    }
    if (seen.has(resolvedName)) {
      warnings.push(`Skipped "${key}" — another entry already maps to "${resolvedName}".`);
      continue;
    }
    seen.add(resolvedName);
    files.push({ key: resolvedName as CloudInitFileKey, content: sub.content });
  }

  const draft: DraftTemplate = {
    name: template.name ?? "",
    author: template.author ?? "",
    version: template.version ?? "",
    icon: template.icon ?? "",
    fields,
    files,
  };
  return { draft, warnings };
}

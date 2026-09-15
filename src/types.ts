// Shared type definitions for config.json, repo index.json, and template files.
// See TEMPLATE_SCHEMA.md for the human-readable version of this schema.

export type FieldType =
  | "string"
  | "text"
  | "password"
  | "int"
  | "float"
  | "bool"
  | "enum"
  | "ipv4"
  | "ipv6"
  | "cidr4"
  | "cidr6"
  | "mac"
  | "hostname"
  | "fqdn"
  | "email"
  | "url"
  | "port"
  | "uuid"
  | "date"
  | "datetime"
  | "timestamp-rfc3339"
  | "unix-timestamp"
  | "ssh-pubkey"
  | "ssh-pubkey-list"
  | "base64"
  | "json";

export type EnumOption = string | { value: string; label?: string };

export interface FieldRestrictions {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  min?: number;
  max?: number;
  options?: EnumOption[];
  protocols?: string[];
  indent?: number;
}

export interface TemplateField {
  name?: string;
  key: string;
  type: FieldType;
  required?: boolean;
  default?: string | boolean;
  description?: string;
  restrictions?: FieldRestrictions;
}

export interface SubTemplate {
  filename?: string;
  content: string;
  fields?: TemplateField[];
}

export interface Template {
  name: string;
  author?: string;
  version?: string;
  icon?: string;
  templates: Record<string, SubTemplate>;
}

export interface RepoIndex {
  name?: string;
  contact?: string;
  templates?: string[];
  last_update?: string | null;
}

export interface SiteConfig {
  name?: string;
  templates?: string;
}

// --- Selection: identifies which template the editor page should load, encoded as URL
// search params so the browser's back/forward and reload all work without a client router.
export type Selection =
  | { source: "site"; path: string }
  | { source: "local"; id: string }
  | { source: "remote"; repoId: string; path: string };

export interface FetchErrorLike extends Error {
  httpStatus?: number;
}

export interface RepoTemplateError {
  path: string;
  url: string;
  message: string;
}

export interface RepoFetchResult {
  templates: TemplateRecord[];
  errors: RepoTemplateError[];
}

// --- IndexedDB record shapes (see src/db.ts) ---

export interface TemplateRecord {
  path: string;
  template: Template;
}

export interface SiteTemplateRecord extends TemplateRecord {
  fetchedAt: number;
}

export interface RemoteTemplateRecord extends TemplateRecord {
  key: string;
  repoId: string;
  fetchedAt: number;
}

export type RemoteRepoStatus = "ok" | "update-available" | "error" | "syncing";

export interface RemoteRepo {
  id: string;
  url: string;
  name: string;
  contact: string;
  indexLastUpdate: string | null;
  syncedUpdate: string | null;
  templatePaths: string[];
  status: RemoteRepoStatus;
  lastError: string | null;
  lastCheckedAt: number;
}

export interface LocalTemplateRecord {
  id: string;
  filename: string;
  addedAt: number;
  template: Template;
}

export interface SiteIndexMeta {
  key: "siteIndex";
  index: RepoIndex;
  base: string;
  fetchedAt: number;
}

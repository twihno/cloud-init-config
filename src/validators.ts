// Field type registry: validation + how each type wants to be rendered as an <input>.
// Every validate(value, restrictions) runs only on non-empty values — emptiness/required
// is handled once, centrally, in validateField() below.
import type { FieldRestrictions, FieldType, TemplateField } from "@/types.ts";

function isValidIPv4(str: string): boolean {
  const parts = str.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && String(Number(p)) === p);
}

// Deliberately hand-rolled rather than regex-only: IPv6 has too many legal shapes
// (::, embedded IPv4, variable group count) to validate reliably with one regex.
function isValidIPv6(raw: string): boolean {
  if (typeof raw !== "string" || raw === "") return false;
  const str = raw.split("%")[0]; // strip zone id, e.g. fe80::1%eth0
  if ((str.match(/::/g) || []).length > 1) return false;
  if (str.includes(":::")) return false;
  const hasDoubleColon = str.includes("::");
  let head = str;
  let tail = "";
  if (hasDoubleColon) {
    const idx = str.indexOf("::");
    head = str.slice(0, idx);
    tail = str.slice(idx + 2);
  } else if (str.startsWith(":") || str.endsWith(":")) {
    return false;
  }
  const headParts = head === "" ? [] : head.split(":");
  const tailParts = tail === "" ? [] : tail.split(":");
  let allParts = [...headParts, ...tailParts];
  if (allParts.length && allParts[allParts.length - 1].includes(".")) {
    if (!isValidIPv4(allParts[allParts.length - 1])) return false;
    allParts = [...allParts.slice(0, -1), "0", "0"];
  }
  if (allParts.some((p) => !/^[0-9a-fA-F]{1,4}$/.test(p))) return false;
  return hasDoubleColon ? allParts.length <= 8 : allParts.length === 8;
}

function isValidCIDR(
  value: string,
  addrValidator: (s: string) => boolean,
  maxPrefix: number,
): boolean {
  const idx = value.lastIndexOf("/");
  if (idx === -1) return false;
  const addr = value.slice(0, idx);
  const prefixStr = value.slice(idx + 1);
  if (!/^\d{1,3}$/.test(prefixStr)) return false;
  const prefix = Number(prefixStr);
  return prefix >= 0 && prefix <= maxPrefix && addrValidator(addr);
}

function isValidDateParts(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidDate(str: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return false;
  return isValidDateParts(Number(m[1]), Number(m[2]), Number(m[3]));
}

function isValidTimeParts(h: number, min: number, s: number): boolean {
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 && s >= 0 && s <= 60; // 60 = leap second
}

function isValidDatetimeLocal(str: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str);
  if (!m) return false;
  if (!isValidDateParts(Number(m[1]), Number(m[2]), Number(m[3]))) return false;
  return isValidTimeParts(Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

function isValidRFC3339(str: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.exec(
    str,
  );
  if (!m) return false;
  if (!isValidDateParts(Number(m[1]), Number(m[2]), Number(m[3]))) return false;
  return isValidTimeParts(Number(m[4]), Number(m[5]), Number(m[6]));
}

const SSH_KEY_TYPES = [
  "ssh-rsa",
  "ssh-ed25519",
  "ssh-dss",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "sk-ecdsa-sha2-nistp256@openssh.com",
  "sk-ssh-ed25519@openssh.com",
];

function isValidBase64String(str: string): boolean {
  return str.length > 0 && str.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(str);
}

function isValidSSHPublicKeyLine(line: string): boolean {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const [type, keyB64] = parts;
  if (!SSH_KEY_TYPES.includes(type)) return false;
  if (!isValidBase64String(keyB64)) return false;
  let decoded: string;
  try {
    decoded = atob(keyB64);
  } catch {
    return false;
  }
  if (decoded.length < 4) return false;
  const len =
    (decoded.charCodeAt(0) << 24) |
    (decoded.charCodeAt(1) << 16) |
    (decoded.charCodeAt(2) << 8) |
    decoded.charCodeAt(3);
  return decoded.slice(4, 4 + len) === type;
}

function checkLength(value: string, restrictions: FieldRestrictions): string | null {
  if (restrictions.minLength != null && value.length < restrictions.minLength) {
    return `Must be at least ${restrictions.minLength} characters.`;
  }
  if (restrictions.maxLength != null && value.length > restrictions.maxLength) {
    return `Must be at most ${restrictions.maxLength} characters.`;
  }
  return null;
}

function checkPattern(value: string, restrictions: FieldRestrictions): string | null {
  if (restrictions.pattern) {
    let re: RegExp;
    try {
      re = new RegExp(restrictions.pattern);
    } catch {
      return `Template defines an invalid pattern: ${restrictions.pattern}`;
    }
    if (!re.test(value)) {
      return restrictions.patternMessage || `Must match pattern: ${restrictions.pattern}`;
    }
  }
  return null;
}

function stringValidator(value: string, restrictions: FieldRestrictions): ValidationResult {
  const message = checkLength(value, restrictions) || checkPattern(value, restrictions);
  return message ? { valid: false, message } : { valid: true };
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export type InputKind =
  | "text"
  | "textarea"
  | "select"
  | "checkbox"
  | "number"
  | "date"
  | "datetime-local"
  | "password";

export interface FieldTypeInfo {
  label: string;
  inputKind: InputKind;
  placeholder?: string;
  rows?: number;
  validate: (value: string, restrictions: FieldRestrictions) => ValidationResult;
}

function wrap(result: ValidationResult): ValidationResult {
  return result.valid ? { valid: true } : result;
}

export const VALIDATORS: Record<FieldType, FieldTypeInfo> = {
  string: {
    label: "Text",
    inputKind: "text",
    validate: (v, r) => wrap(stringValidator(v, r)),
  },
  text: {
    label: "Multi-line text",
    inputKind: "textarea",
    validate: (v, r) => wrap(stringValidator(v, r)),
  },
  password: {
    label: "Password",
    inputKind: "password",
    validate: (v, r) => wrap(stringValidator(v, r)),
  },
  int: {
    label: "Integer",
    inputKind: "number",
    validate: (v, r) => {
      if (!/^-?\d+$/.test(v)) return { valid: false, message: "Must be a whole number." };
      const n = Number(v);
      if (r.min != null && n < r.min) return { valid: false, message: `Must be ≥ ${r.min}.` };
      if (r.max != null && n > r.max) return { valid: false, message: `Must be ≤ ${r.max}.` };
      return { valid: true };
    },
  },
  float: {
    label: "Number",
    inputKind: "number",
    validate: (v, r) => {
      if (v === "" || Number.isNaN(Number(v)))
        return { valid: false, message: "Must be a number." };
      const n = Number(v);
      if (r.min != null && n < r.min) return { valid: false, message: `Must be ≥ ${r.min}.` };
      if (r.max != null && n > r.max) return { valid: false, message: `Must be ≤ ${r.max}.` };
      return { valid: true };
    },
  },
  bool: {
    label: "Boolean",
    inputKind: "checkbox",
    validate: () => ({ valid: true }),
  },
  enum: {
    label: "Choice",
    inputKind: "select",
    validate: (v, r) => {
      const options = (r.options || []).map((o) => (typeof o === "string" ? o : o.value));
      if (!options.includes(v)) return { valid: false, message: "Not one of the allowed options." };
      return { valid: true };
    },
  },
  ipv4: {
    label: "IPv4 address",
    inputKind: "text",
    placeholder: "192.168.1.10",
    validate: (v) =>
      isValidIPv4(v) ? { valid: true } : { valid: false, message: "Not a valid IPv4 address." },
  },
  ipv6: {
    label: "IPv6 address",
    inputKind: "text",
    placeholder: "2001:db8::1",
    validate: (v) =>
      isValidIPv6(v) ? { valid: true } : { valid: false, message: "Not a valid IPv6 address." },
  },
  cidr4: {
    label: "IPv4 CIDR",
    inputKind: "text",
    placeholder: "192.168.1.0/24",
    validate: (v) =>
      isValidCIDR(v, isValidIPv4, 32)
        ? { valid: true }
        : {
            valid: false,
            message: "Not a valid IPv4 CIDR (e.g. 192.168.1.0/24).",
          },
  },
  cidr6: {
    label: "IPv6 CIDR",
    inputKind: "text",
    placeholder: "2001:db8::/32",
    validate: (v) =>
      isValidCIDR(v, isValidIPv6, 128)
        ? { valid: true }
        : {
            valid: false,
            message: "Not a valid IPv6 CIDR (e.g. 2001:db8::/32).",
          },
  },
  mac: {
    label: "MAC address",
    inputKind: "text",
    placeholder: "dc:a6:32:00:00:00",
    validate: (v) =>
      /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(v)
        ? { valid: true }
        : { valid: false, message: "Not a valid MAC address." },
  },
  hostname: {
    label: "Hostname",
    inputKind: "text",
    placeholder: "raspberrypi",
    validate: (v) =>
      /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/.test(v)
        ? { valid: true }
        : {
            valid: false,
            message:
              "Not a valid hostname label (letters, digits, hyphens; no leading/trailing hyphen).",
          },
  },
  fqdn: {
    label: "Fully qualified domain name",
    inputKind: "text",
    placeholder: "pi.home.example.com",
    validate: (v) => {
      if (v.length > 253) return { valid: false, message: "Too long for a domain name." };
      const labels = v.split(".");
      if (labels.length < 2)
        return {
          valid: false,
          message: "Must contain at least one dot (e.g. host.example.com).",
        };
      const ok = labels.every((l) => /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/.test(l));
      return ok ? { valid: true } : { valid: false, message: "Contains an invalid domain label." };
    },
  },
  email: {
    label: "Email address",
    inputKind: "text",
    placeholder: "admin@example.com",
    validate: (v) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
        ? { valid: true }
        : { valid: false, message: "Not a valid email address." },
  },
  url: {
    label: "URL",
    inputKind: "text",
    placeholder: "https://example.com",
    validate: (v, r) => {
      let parsed: URL;
      try {
        parsed = new URL(v);
      } catch {
        return { valid: false, message: "Not a valid URL." };
      }
      if (r.protocols && !r.protocols.includes(parsed.protocol.replace(":", ""))) {
        return {
          valid: false,
          message: `URL must use one of: ${r.protocols.join(", ")}.`,
        };
      }
      return { valid: true };
    },
  },
  port: {
    label: "Port number",
    inputKind: "number",
    validate: (v) => {
      if (!/^\d+$/.test(v)) return { valid: false, message: "Must be a whole number." };
      const n = Number(v);
      return n >= 1 && n <= 65535
        ? { valid: true }
        : { valid: false, message: "Must be between 1 and 65535." };
    },
  },
  uuid: {
    label: "UUID",
    inputKind: "text",
    placeholder: crypto.randomUUID(),
    validate: (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
        ? { valid: true }
        : { valid: false, message: "Not a valid UUID." },
  },
  date: {
    label: "Date",
    inputKind: "date",
    validate: (v) =>
      isValidDate(v)
        ? { valid: true }
        : { valid: false, message: "Not a valid date (YYYY-MM-DD)." },
  },
  datetime: {
    label: "Date & time",
    inputKind: "datetime-local",
    validate: (v) =>
      isValidDatetimeLocal(v)
        ? { valid: true }
        : { valid: false, message: "Not a valid date/time." },
  },
  "timestamp-rfc3339": {
    label: "Timestamp (RFC 3339)",
    inputKind: "text",
    placeholder: "2026-09-15T12:00:00Z",
    validate: (v) =>
      isValidRFC3339(v)
        ? { valid: true }
        : {
            valid: false,
            message: "Not a valid RFC 3339 timestamp (e.g. 2026-09-15T12:00:00Z).",
          },
  },
  "unix-timestamp": {
    label: "Unix timestamp",
    inputKind: "number",
    validate: (v, r) => {
      if (!/^\d+$/.test(v))
        return {
          valid: false,
          message: "Must be a whole number of seconds since epoch.",
        };
      const n = Number(v);
      const min = r.min ?? 0;
      const max = r.max ?? 4102444800; // year 2100, sanity ceiling
      return n >= min && n <= max
        ? { valid: true }
        : { valid: false, message: `Must be between ${min} and ${max}.` };
    },
  },
  "ssh-pubkey": {
    label: "SSH public key",
    inputKind: "textarea",
    rows: 2,
    validate: (v) =>
      isValidSSHPublicKeyLine(v)
        ? { valid: true }
        : {
            valid: false,
            message: "Not a recognized SSH public key (ssh-rsa, ssh-ed25519, ecdsa-sha2-*, …).",
          },
  },
  "ssh-pubkey-list": {
    label: "SSH public keys (one per line)",
    inputKind: "textarea",
    rows: 5,
    validate: (v) => {
      const lines = v
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length)
        return {
          valid: false,
          message: "Provide at least one SSH public key.",
        };
      const badLine = lines.find((l) => !isValidSSHPublicKeyLine(l));
      if (badLine)
        return {
          valid: false,
          message: `Invalid SSH public key: ${badLine.slice(0, 40)}${badLine.length > 40 ? "…" : ""}`,
        };
      return { valid: true };
    },
  },
  base64: {
    label: "Base64",
    inputKind: "textarea",
    rows: 3,
    validate: (v) =>
      isValidBase64String(v)
        ? { valid: true }
        : { valid: false, message: "Not valid base64 data." },
  },
  json: {
    label: "JSON",
    inputKind: "textarea",
    rows: 4,
    validate: (v) => {
      try {
        JSON.parse(v);
        return { valid: true };
      } catch (err) {
        return { valid: false, message: `Invalid JSON: ${(err as Error).message}` };
      }
    },
  },
};

export interface FieldValidationResult {
  valid: boolean;
  message: string | null;
}

export function validateField(
  field: TemplateField,
  rawValue: string | boolean | undefined,
): FieldValidationResult {
  const type = VALIDATORS[field.type];
  if (!type) return { valid: false, message: `Unknown field type "${field.type}".` };
  const required = field.required !== false;
  const value = rawValue ?? "";
  const strValue = String(value);
  if (strValue === "") {
    return required
      ? { valid: false, message: "This field is required." }
      : { valid: true, message: null };
  }
  const result = type.validate(strValue, field.restrictions || {});
  return result.valid
    ? { valid: true, message: null }
    : { valid: false, message: result.message ?? null };
}

export function getFieldTypeInfo(type: FieldType): FieldTypeInfo | null {
  return VALIDATORS[type] || null;
}

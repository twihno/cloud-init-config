# Template & repo schema

This app is a static site with no backend. Everything it shows comes from JSON files it
fetches (or that you import from disk). This doc describes those JSON shapes for anyone
writing templates or hosting a repo.

## `config.json` (site root)

Fetched fresh on every page load.

```json
{
  "name": "Cloud-Init Config",
  "templates": "./templates"
}
```

- `name` (optional) — shown as the page title.
- `templates` — path to this site's own bundled template repo (a folder containing an
  `index.json` in the format below). Always force-refreshed on load, no caching negotiation.

## Repo `index.json` (site repo and any remote repo)

```json
{
  "name": "My Templates",
  "contact": "Jane Doe <jane@example.com>",
  "templates": ["/raspberry1.json", "/other-device.json"],
  "last_update": "2026-09-15T00:00:00Z"
}
```

- `templates` — paths of template files, resolved relative to the repo's base URL.
- `last_update` — RFC 3339 timestamp. On every page load the app re-fetches each remote
  repo's `index.json` and compares this value against what it last **synced**. If it's newer
  (or the repo was never synced), the repo is flagged "update available" in the UI — the
  actual template bodies are only downloaded when the user clicks **Sync**. The site's own
  repo (from `config.json`) skips this dance and is always fully refetched.

## Template file

```json
{
  "name": "Raspberry Pi",
  "author": "Jane Doe <jane@example.com>",
  "version": "1.0.0",
  "icon": "data:image/svg+xml;base64,…",
  "templates": {
    "user-data": {
      "filename": "user-data",
      "content": "#cloud-config\nhostname: __hostname__\n",
      "fields": [
        {
          "name": "Hostname",
          "key": "hostname",
          "type": "hostname",
          "required": true,
          "default": "raspberrypi"
        }
      ]
    }
  }
}
```

- `icon` (optional) — a `data:image/...;base64,...` URL, shown on the card and in the
  editor header. Anything else (or a missing icon) falls back to a generic icon.
- `templates` — one entry per **output file** (`user-data`, `meta-data`, `network-config`,
  …). Each entry:
  - `filename` (optional) — the name written to disk / used for downloads. Defaults to the
    object's key if omitted.
  - `content` — the raw file content with `__key__` placeholders.
  - `fields` — the inputs that fill those placeholders (see below).

### Shared fields

The left-hand configuration form is built from the **union** of `fields` across every
sub-template, de-duplicated by `key` (first definition wins for its label/type/description).
Reuse the same `key` in several sub-templates (e.g. `hostname` in both `user-data` and
`meta-data`) and the user only fills it in once.

### Placeholder substitution

Substitution is a literal, global `__key__` → value replace — there is no conditional
logic, loops, or escaping beyond what each field type does. Design templates so an empty
_optional_ field degrades to something harmless (e.g. wrap it in quotes so an empty string is
still valid YAML, or put it on its own line).

List-type fields (currently `ssh-pubkey-list`) are formatted as a YAML block-list, one
`- item` per line, indented by `restrictions.indent` spaces. Place the `__key__` token alone
on its own line at the target indentation's parent.

### Field object

```json
{
  "name": "Display label",
  "key": "unique_key",
  "type": "ipv4",
  "required": true,
  "default": "",
  "description": "Optional help text shown under the label.",
  "restrictions": {}
}
```

`required` defaults to `true` when omitted.

`restrictions.pattern` (on `string`/`text`/`password`) is applied both by our own JS
validation and, when the browser accepts it, as the native HTML `pattern` attribute.
Escape a literal hyphen inside a character class as `\\-` (e.g. `[a-z0-9_\\-]`, written
`"[a-z0-9_\\\\-]"` in JSON) — an unescaped trailing `-` is valid in a plain `RegExp` but
some browsers reject it for the `pattern` attribute's stricter regex mode. If a pattern
isn't accepted there, the app silently skips the native attribute and still enforces it in
JS, so this only affects the browser's built-in inline validation UI.

### Field types

| type                | restrictions                                            | notes                                                 |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| `string`            | `minLength`, `maxLength`, `pattern`, `patternMessage`   |                                                       |
| `text`              | same as `string`                                        | multi-line textarea                                   |
| `password`          | same as `string`                                        | masked input                                          |
| `int`               | `min`, `max`                                            | whole numbers only                                    |
| `float`             | `min`, `max`                                            |                                                       |
| `bool`              | —                                                       | checkbox; substitutes as `true`/`false`               |
| `enum`              | `options`: `["a","b"]` or `[{"value":"a","label":"A"}]` | rendered as a `<select>`                              |
| `ipv4` / `ipv6`     | —                                                       |                                                       |
| `cidr4` / `cidr6`   | —                                                       | e.g. `192.168.1.0/24`, `2001:db8::/32`                |
| `mac`               | —                                                       | `aa:bb:cc:dd:ee:ff` or with `-`                       |
| `hostname`          | —                                                       | single RFC1123 label                                  |
| `fqdn`              | —                                                       | dotted hostname, ≥2 labels                            |
| `email`             | —                                                       | practical, not full RFC 5322                          |
| `url`               | `protocols`: `["https"]`                                | validated via the `URL` constructor                   |
| `port`              | —                                                       | 1–65535                                               |
| `uuid`              | —                                                       | has a "Generate" button in the form                   |
| `date`              | —                                                       | `YYYY-MM-DD`, real calendar date                      |
| `datetime`          | —                                                       | `YYYY-MM-DDTHH:mm[:ss]`                               |
| `timestamp-rfc3339` | —                                                       | full RFC 3339 with offset/`Z`                         |
| `unix-timestamp`    | `min`, `max`                                            | seconds since epoch                                   |
| `ssh-pubkey`        | —                                                       | one key; checks type prefix + decodes the base64 blob |
| `ssh-pubkey-list`   | `indent`                                                | one key per line; see substitution notes above        |
| `base64`            | —                                                       |                                                       |
| `json`              | —                                                       | must `JSON.parse`                                     |

## Local imports & remote repos

- **Local configs**: dropped/selected template JSON files, validated against the shape above,
  stored only in this browser's IndexedDB.
- **Remote repos**: any URL serving `index.json` + template files in this format. The
  browser fetches them directly (no backend proxy), so the host must send permissive CORS
  headers (`Access-Control-Allow-Origin`) or the add-repo preview will fail.

## Export

Each rendered output file offers **copy as text**, **copy as base64**, and **save to disk**.
A single **replace files on boot partition** action (File System Access API, Chromium-based
browsers only) writes every sub-template's rendered content into a chosen local directory in
one go, after checking the directory for at least one of `user-data`, `meta-data`,
`network-config` to guess whether the right folder was picked.

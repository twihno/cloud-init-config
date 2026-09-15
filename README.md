# Cloud-Init Config

A static, no-backend web app for customizing cloud-init files before a deployment.
It does **not** generate templates — someone writes those ahead of time (see
[TEMPLATE_SCHEMA.md](TEMPLATE_SCHEMA.md)) — it fills them in, validates the values, and
gets the result onto a device.

> [!NOTE]
> **This project is 100% vibe-coded.** Every line of HTML/CSS/JS here, this README, and
> `TEMPLATE_SCHEMA.md` were written by Claude (Anthropic) from a conversational spec, with
> no hand-written code. It has been syntax-checked and logic-tested (validators, template
> rendering) but has **not** been exercised end-to-end in a real browser. Review it before
> trusting it with real infrastructure, especially the disk-writing export path.

## Human preamble

I don't know what to write here: Yes, this is 100% AI slop and vibe coded.
This isn't perfect. This somewhat shouldn't exist.
We needed a simple tool to customize our cloud init files more or less only for some of our raspberry pis.
This makes this easy, reproducible and less error-prone.
Idk. Use it if you want.

And also from a technical standpoint: Yes, this could use a bundler, typescript and everything.
Would load better and produce smaller files. We only plan to deploy this on an internal server
and use it sparsely so loading multiple files is somewhat irrelevant.

## Features

- **Three sources of templates**, shown as cards you can switch between grid/list view:
  - **Local configs** — template files you drag-and-drop or pick from disk, kept only in
    this browser (IndexedDB).
  - **Site templates** — the repo bundled with this site (via `config.json`), force-refreshed
    on every page load.
  - **Remote repos** — any URL serving an `index.json` in the same format. Checked for
    updates on every load; template bodies only download when you hit **Sync**.
- **Validated fields** for IPv4/IPv6, CIDR, MAC, hostnames/FQDNs, ports, UUIDs, dates and
  RFC 3339 timestamps, SSH public keys (RSA/Ed25519/ECDSA/…), base64, JSON, and more —
  see the full list in [TEMPLATE_SCHEMA.md](TEMPLATE_SCHEMA.md#field-types).
- **Live, syntax-highlighted preview** of every rendered output file as you type (YAML
  highlighting via a vendored highlight.js, see [Project layout](#project-layout)).
- **Four export paths**: copy as text, copy as base64 (handy for VMware guest metadata,
  etc.), save to disk, and a one-click **replace files on boot partition** that uses the
  File System Access API to write straight into a chosen folder — with a sanity check that
  warns you if the folder doesn't look like a cloud-init boot partition.
- **Auto light/dark theme** (pure CSS `prefers-color-scheme`, no toggle/JS needed).
- Author/contact fields in the `Name <email>` format are rendered as clickable `mailto:`
  links.
- No native browser popups — confirmations use an in-app themed dialog.

## Quick start

This is a static site: any web server works, as long as it serves the directory over
`http://` or `https://` (not `file://` — IndexedDB, the Clipboard API, and the File System
Access API all require a proper origin).

```sh
python3 -m http.server 8080
# or: npx serve .
```

Then open `http://localhost:8080`. To deploy, upload the whole directory (including
`templates/`) to any static host.

## Using it

1. **Browse** — cards are grouped into Local configs, Site templates, and one section per
   remote repo. Toggle grid/tile vs. list layout with the buttons in the header (persisted
   in `localStorage`).
2. **Add a local config** — "+ Local config" opens a drag-and-drop / file-picker dialog.
   Each file is validated and imported independently, with per-file success/error feedback.
3. **Add a remote repo** — "+ Remote repo" fetches and previews the repo's `index.json` and
   templates before you confirm adding it. The host must allow cross-origin requests (CORS)
   for this to work, since there's no backend proxy.
4. **Sync** — remote repos are flagged "update available" automatically when their
   `index.json`'s `last_update` moves past what you last synced; click **Sync now** /
   **Re-sync** on that repo, or **Sync remotes** in the header to sync everything at once.
5. **Configure** — click a template card to open the editor: your inputs on the left
   (validated as you type, with inline error messages), the rendered output files on the
   right, updating live.
6. **Export** — per file: copy as text, copy as base64, or save to disk. For the whole set
   at once: **Replace files on boot partition…**, which asks for a folder (e.g. a
   Raspberry Pi's boot partition) and writes every file into it after checking it actually
   looks like the right folder.

## Requirements

Targets current Chrome, Firefox, and Safari on developer machines — no polyfills, no build
step. A few things degrade gracefully or are simply unavailable on older/unsupported
browsers:

- **File System Access API** (`showDirectoryPicker`) is needed for "Replace files on boot
  partition"; where it's missing, that button is disabled with an explanation and you fall
  back to "Save to disk" per file.
- **Clipboard API**, **IndexedDB**, and ES modules are required for the app to function at
  all.

## Project layout

```text
config.json              site config: page name + path to the bundled template repo
templates/                the site's own template repo
  index.json               repo index (template list + last_update)
  raspberry1.json           example template (Raspberry Pi cloud-init)
index.html / style.css    shell + theme
js/
  app.js                   state, wiring, page init
  store.js                 IndexedDB-backed repo/template fetching & caching
  db.js                    thin IndexedDB promise wrapper
  validators.js            field type registry + validation
  templater.js             field de-duplication, `__key__` substitution, shape checks
  editor.js                configuration form + live preview panel
  render-browse.js         card/section rendering for the browse view
  modals.js                add-local / add-remote dialogs
  confirm.js               themed replacement for window.confirm()
  export.js                copy/save/replace-on-disk
  dom.js                   tiny safe DOM-builder + contact-link/icon helpers
  syntax-highlight.js      wrapper around the vendored highlight.js below
  highlight/               vendored highlight.js 11.x (BSD-3-Clause), core + YAML grammar
                            only — see js/highlight/LICENSE
TEMPLATE_SCHEMA.md        schema reference for config.json / index.json / template files
```

## Writing templates

See [TEMPLATE_SCHEMA.md](TEMPLATE_SCHEMA.md) for the full schema: `config.json`, repo
`index.json`, the template file format (including the base64 `icon` field), the complete
field-type/validator table, and how placeholder substitution and shared fields work.

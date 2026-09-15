# Cloud-Init Config

A static, no-backend web app for customizing cloud-init files before a deployment.
It does **not** generate templates — someone writes those ahead of time (see
[TEMPLATE_SCHEMA.md](TEMPLATE_SCHEMA.md)) — it fills them in, validates the values, and
gets the result onto a device.

> [!NOTE]
> **This project is 100% vibe-coded.** Every line of TypeScript/CSS here, this README, and
> `TEMPLATE_SCHEMA.md` were written by Claude (Anthropic) from a conversational spec, with
> no hand-written code. It has been syntax-checked, type-checked, and logic-tested
> (validators, template rendering), and exercised end-to-end in a real browser. Review it
> before trusting it with real infrastructure, especially the disk-writing export path.

## Human preamble

I don't know what to write here: Yes, this is 100% AI slop and vibe coded.
This isn't perfect. This somewhat shouldn't exist.
We needed a simple tool to customize our cloud init files more or less only for some of our raspberry pis.
This makes this easy, reproducible and less error-prone.
Idk. Use it if you want.

## Features

- **Three sources of templates**, shown as cards you can switch between grid/list view:
  - **Local configs** — template files you drag-and-drop or pick from disk, kept only in
    this browser (IndexedDB).
  - **Site templates** — the repo bundled with this site (via `config.json`), force-refreshed
    on every page load. Entirely optional: omit `templates` from `config.json` and this
    section doesn't appear at all.
  - **Remote repos** — any URL serving an `index.json` in the same format. Checked for
    updates on every load; template bodies only download when you hit **Sync**.
- **The editor has its own URL** (`/editor/?source=...`), so opening a template, using the
  browser's back/forward buttons, and reloading mid-edit all work normally — no client-side
  router, still a fully static build.
- **A template creator** at `/new` ("+ New template" in the header) for building a template
  JSON from scratch, in the same two-column layout as the editor: variables (with type,
  default, description, and per-type restrictions) on the left along with one entry per
  output file — restricted to `user-data`, `meta-data`, and `network-config`, the only
  filenames cloud-init's NoCloud/ConfigDrive datasource actually reads off the boot
  partition — with a live syntax-highlighted preview of each file's raw YAML on the right.
  Drag-and-drop icon upload, a collapsible template-details card (reusing the same card
  used for the browse view's list layout), live YAML-syntax checking of each file's
  content, and a check that every `__key__` a file uses is actually defined as a variable.
  Export via copy to clipboard or save to disk.
- **Validated fields** for IPv4/IPv6, CIDR, MAC, hostnames/FQDNs, ports, UUIDs, dates and
  RFC 3339 timestamps, SSH public keys (RSA/Ed25519/ECDSA/…), base64, JSON, and more —
  see the full list in [TEMPLATE_SCHEMA.md](TEMPLATE_SCHEMA.md#field-types).
- **Live, syntax-highlighted preview** of every rendered output file as you type (YAML
  highlighting via [highlight.js](https://highlightjs.org/)).
- **Four export paths**: copy as text, copy as base64 (handy for VMware guest metadata,
  etc.), save to disk, and a one-click **replace files on boot partition** that uses the
  File System Access API to write straight into a chosen folder — with a sanity check that
  warns you if the folder doesn't look like a cloud-init boot partition.
- **Auto light/dark theme** (pure CSS `prefers-color-scheme`, no toggle/JS needed).
- Author/contact fields in the `Name <email>` format are rendered as clickable `mailto:`
  links.
- No native browser popups — confirmations use an in-app themed dialog.

## Quick start

Requires [pnpm](https://pnpm.io/) (version pinned in `package.json`; if you have
[Vite+](https://viteplus.dev/) installed, `vp install` downloads it for you automatically).

```sh
pnpm install
pnpm dev          # dev server with hot reload
pnpm build        # type-checks, then builds the static site into dist/
pnpm preview      # serve the dist/ build locally
```

The result (`dist/`) is a static site: any web server works, as long as it serves the
directory over `http://` or `https://` (not `file://` — IndexedDB, the Clipboard API, and
the File System Access API all require a proper origin). To deploy, upload the whole
`dist/` directory to any static host — see [deployment/](deployment/) for reference nginx
and Caddy configs.

Publishing a GitHub release also builds and attaches a deployment zip, and deploys the
same build to GitHub Pages — see [.github/workflows/release.yml](.github/workflows/release.yml)
(GitHub Pages needs to be switched to the "GitHub Actions" source once, in repo Settings ->
Pages, before the first deploy).

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
5. **Configure** — click a template card to open the editor at its own URL (e.g.
   `/editor/?source=site&path=/raspberry1.json`): your inputs on the left (validated as
   you type, with inline error messages), the rendered output files on the right, updating
   live. The browser's back button returns you to the browse view.
6. **Export** — per file: copy as text, copy as base64, or save to disk. For the whole set
   at once: **Replace files on boot partition…**, which asks for a folder (e.g. a
   Raspberry Pi's boot partition) and writes every file into it after checking it actually
   looks like the right folder.
7. **Create (or resume editing) a template** — "+ New template" opens the creator at
   `/new`. Fill in the template's name/author/version and drag-and-drop (or click to pick)
   an icon image; collapse **Template details** down to a preview card once it's filled in
   to free up space. Add variables (key, label, type, required, default, description, and
   type-specific restrictions like min/max or a pattern), and add any of the three files
   cloud-init recognizes (`user-data`, `meta-data`, `network-config`) with its raw YAML
   content (`__key__` placeholders, checked for valid YAML syntax as you type, with a live
   highlighted preview on the right). An issues panel flags any `__key__` a file uses that
   isn't defined as a variable. **Open template…** loads an existing template JSON back
   into the creator to keep editing it (starting with **Template details** collapsed,
   since it's presumably already filled in) — anything that isn't one of the three
   recognized filenames is skipped with a warning, since the creator can't represent it.
   **Copy JSON** / **Save to disk** produce the template file — warning first, but not
   blocking, if something looks off.

## Requirements

Targets current Chrome, Firefox, and Safari on developer machines — no polyfills, and the
build step is dev-time only (the shipped output is plain HTML/CSS/JS). A few things
degrade gracefully or are simply unavailable on older/unsupported browsers:

- **File System Access API** (`showDirectoryPicker`) is needed for "Replace files on boot
  partition"; where it's missing, that button is disabled with an explanation and you fall
  back to "Save to disk" per file.
- **Clipboard API**, **IndexedDB**, and ES modules are required for the app to function at
  all.

## Project layout

`src/` is the Vite project root (see `root` in `vite.config.ts`), so it holds both pages
and all the app code; `public/` holds files served as-is at the site root, outside the
build. TypeScript files import each other via the `@/` alias (`@/store.ts` etc.), which
resolves to `src/`.

```text
public/
  config.json               site config: page name + (optional) path to the bundled template repo
  templates/                 the site's own template repo
    index.json                repo index (template list + last_update)
    raspberry1.json            example template (Raspberry Pi cloud-init)
  favicon.svg
src/
  index.html                browse view (site root)
  editor/index.html          editor view, at /editor/ — template selected via ?source=... query params
  new/index.html              template creator, at /new/
  main.ts                    browse page: state, wiring, page init
  editor-main.ts              editor page: resolves ?source=... to a template, mounts the editor
  new-main.ts                 creator page: DOM wiring for creator.ts's model/validation
  creator.ts                  creator's draft model, validation (semver/author/keys/YAML), JSON export
  routes.ts                  encodes/decodes the editor URL's query params
  site.ts                    loads config.json + the (optional) site template repo
  store.ts                   IndexedDB-backed repo/template fetching & caching
  db.ts                      thin typed IndexedDB promise wrapper
  validators.ts              field type registry + validation
  templater.ts                field de-duplication, `__key__` substitution, shape checks
  editor.ts                   configuration form + live preview panel
  render-browse.ts            card/section rendering for the browse view
  modals.ts                   add-local / add-remote dialogs
  confirm.ts                   themed replacement for window.confirm()
  export.ts                   copy/save/replace-on-disk
  dom.ts                      tiny safe DOM-builder + contact-link/icon helpers
  syntax-highlight.ts          wrapper around highlight.js (npm dependency), core + YAML grammar only
  types.ts                    shared TypeScript types for config.json / index.json / template files
  style.css                   shell + theme
vite.config.ts              multi-page build (index.html + editor/ + new/), @ alias, public dir
TEMPLATE_SCHEMA.md          schema reference for config.json / index.json / template files
```

`pnpm build` type-checks `src/` and bundles everything above into a static `dist/`
directory (`dist/index.html`, `dist/editor/`, `dist/new/`, `dist/assets/`, plus
`config.json` and `templates/` copied as-is from `public/`).

## Writing templates

See [TEMPLATE_SCHEMA.md](TEMPLATE_SCHEMA.md) for the full schema: `config.json`, repo
`index.json`, the template file format (including the base64 `icon` field), the complete
field-type/validator table, and how placeholder substitution and shared fields work.

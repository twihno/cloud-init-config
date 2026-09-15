# Deployment configs

Reference server configs for two different things this app can be:

- **The app itself** (`nginx/app.conf`, `caddy/Caddyfile`) — serves the production
  build (`pnpm run build` → `dist/`: `index.html`, `editor/`, `assets/`, `config.json`,
  `templates/`) with the strictest Content-Security-Policy (and companion security
  headers) that still lets the app work.
- **A template repo host** (`nginx/repo-cors-*.conf`, `caddy/repo-cors-*.conf`) — serves
  just a directory of `index.json` + template JSON files (see
  [../TEMPLATE_SCHEMA.md](../TEMPLATE_SCHEMA.md)) for other app instances to add as a
  remote repo via "+ Remote repo". These are separate because a repo doesn't need to be
  hosted on the same server, or even the same organization, as any particular app
  instance.

None of these files are wired into anything automatically — copy the relevant one into
your nginx/Caddy config, replace the placeholder hostnames/paths, and reload.

## The CSP, directive by directive

```
default-src 'none';
script-src 'self';
style-src 'self';
img-src 'self' data:;
font-src 'none';
connect-src 'self' https:;
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
frame-src 'none';
worker-src 'none';
manifest-src 'none';
media-src 'none';
child-src 'none';
upgrade-insecure-requests
```

| Directive                                                               | Value           | Why                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src`                                                           | `'none'`        | Deny-by-default baseline; every other directive below opens exactly what's needed and nothing else.                                                                                                                                                                                                                                          |
| `script-src`                                                            | `'self'`        | Only same-origin `<script type="module">` files. No `'unsafe-inline'`, no `'unsafe-eval'` — the app has no inline `<script>`, no inline event-handler attributes, and no `eval`/`new Function` anywhere.                                                                                                                                     |
| `style-src`                                                             | `'self'`        | Only the built stylesheet under `assets/`. No inline `style="..."` attributes are used anywhere in the app.                                                                                                                                                                                                                                  |
| `img-src`                                                               | `'self' data:`  | Template `icon` fields are `data:image/...;base64,...` URIs embedded in the JSON — `data:` is required for those to render.                                                                                                                                                                                                                  |
| `font-src`                                                              | `'none'`        | The app only uses the system font stack; no `@font-face`/custom fonts are loaded.                                                                                                                                                                                                                                                            |
| `connect-src`                                                           | `'self' https:` | `fetch()` to same-origin `config.json`/`templates/*.json`, **plus** whatever URL a user adds via "+ Remote repo" — which is arbitrary and unknowable in advance. This is the one directive that can't be fully locked to `'self'` without breaking that feature. If you don't use remote repos at all, change this to `connect-src 'self';`. |
| `object-src`                                                            | `'none'`        | No `<object>`/`<embed>`.                                                                                                                                                                                                                                                                                                                     |
| `base-uri`                                                              | `'none'`        | The app never uses a `<base>` tag; this stops one from being injected to hijack relative-URL resolution.                                                                                                                                                                                                                                     |
| `form-action`                                                           | `'none'`        | Nothing in the app submits a form to a URL (the only `<form>` elements are either `method="dialog"`, which never navigates, or plain field containers with no submit action).                                                                                                                                                                |
| `frame-ancestors`                                                       | `'none'`        | The app must never be embedded in an iframe on another site (clickjacking protection).                                                                                                                                                                                                                                                       |
| `frame-src` / `worker-src` / `manifest-src` / `media-src` / `child-src` | `'none'`        | The app uses none of these (no iframes, workers, web app manifest, or audio/video).                                                                                                                                                                                                                                                          |
| `upgrade-insecure-requests`                                             | —               | Belt-and-braces for an HTTPS deployment; drop it (see the configs) if you're serving plain HTTP on an internal network.                                                                                                                                                                                                                      |

## Other security headers

Bundled alongside the CSP in both configs:

- `X-Content-Type-Options: nosniff` — stops the browser from guessing content types.
- `X-Frame-Options: DENY` — pre-CSP-`frame-ancestors` fallback for older clients.
- `Referrer-Policy: no-referrer` — never leak this app's URL to anything it links to (it doesn't link anywhere, but this also covers e.g. a future favicon fetch).
- `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Resource-Policy: same-origin` — isolate this origin's browsing context and resources from other origins.
- `Cross-Origin-Embedder-Policy: require-corp` — the strict pairing for COOP above. Safe here because the app never embeds cross-origin `<img>`/`<script>`/iframes directly (all cross-origin data comes in through `fetch()`, which COEP doesn't touch). If something unexpected breaks after enabling this, it's the first header to try removing.
- `Permissions-Policy: ...` — turns off every browser feature (camera, mic, geolocation, USB, etc.) the app never uses.
- `Strict-Transport-Security` — only in the HTTPS configs; tells browsers to never downgrade this host to plain HTTP.

## Repo CORS options

A plain cross-origin `GET` with no custom request headers is a CORS "simple request" —
it never triggers a preflight `OPTIONS`, so the only thing that matters is whether
`Access-Control-Allow-Origin` is present on the actual response. Three ready-to-adapt
variants are provided per server:

| File                   | `Access-Control-Allow-Origin` | Use when                                                                                                                                                                                                 |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo-cors-disabled.*` | _(not sent)_                  | The repo should only ever be used same-origin (e.g. it's just this app's own bundled `./templates`) — other instances' "Add remote repo" will fail with a CORS error.                                    |
| `repo-cors-domain.*`   | one hardcoded origin          | Exactly one other app instance (a known, trusted deployment) should be able to add this repo.                                                                                                            |
| `repo-cors-wildcard.*` | `*`                           | Anyone should be able to add this as a remote repo. Fine for a genuinely public template set; the repo is plain unauthenticated JSON either way, so never put anything sensitive in one served this way. |

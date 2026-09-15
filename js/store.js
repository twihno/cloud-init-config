import * as db from "./db.js";
import { validateTemplateShape } from "./templater.js";

// Turns a fetch()/JSON failure into a message that actually tells the user what to do next,
// since the most common failure mode here (a static host with no CORS headers) otherwise
// just surfaces as an opaque "Failed to fetch".
export function describeFetchError(err, url) {
  if (err instanceof TypeError) {
    return `Could not reach ${url}. Check the address, your connection, and that the server allows cross-origin requests (CORS) — static hosts often need an Access-Control-Allow-Origin header for this to work from another origin.`;
  }
  if (err && err.httpStatus) {
    return `Server responded with ${err.httpStatus} for ${url}. Check that the file exists at this location.`;
  }
  if (err instanceof SyntaxError) {
    return `${url} did not contain valid JSON.`;
  }
  return `${url}: ${err.message || err}`;
}

async function fetchJSON(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw err; // network / CORS -> TypeError, handled by describeFetchError
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return res.json();
}

function joinRepoPath(base, path) {
  return `${base.replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

export async function loadSiteConfig() {
  return fetchJSON("./config.json", { cache: "no-store" });
}

async function fetchRepoTemplates(base, index) {
  const templates = [];
  const errors = [];
  for (const path of index.templates || []) {
    const url = joinRepoPath(base, path);
    try {
      const template = await fetchJSON(url, { cache: "no-store" });
      const shapeErrors = validateTemplateShape(template);
      if (shapeErrors.length) {
        errors.push({
          path,
          url,
          message: `Invalid template: ${shapeErrors.join(" ")}`,
        });
        continue;
      }
      templates.push({ path, template });
    } catch (err) {
      errors.push({ path, url, message: describeFetchError(err, url) });
    }
  }
  return { templates, errors };
}

// Site repo (declared in config.json) is same-origin and cheap, so it is always
// force-refetched on load rather than compared against a cached last_update.
export async function forceSyncSiteRepo(basePath) {
  const base = basePath.replace(/\/$/, "");
  const indexUrl = `${base}/index.json`;
  const index = await fetchJSON(indexUrl, { cache: "no-store" });
  const { templates, errors } = await fetchRepoTemplates(base, index);
  await db.dbClear("siteTemplates");
  await db.dbPutMany(
    "siteTemplates",
    templates.map((t) => ({
      path: t.path,
      template: t.template,
      fetchedAt: Date.now(),
    })),
  );
  await db.dbPut("meta", {
    key: "siteIndex",
    index,
    base,
    fetchedAt: Date.now(),
  });
  return { index, templates, errors };
}

export async function getCachedSiteTemplates() {
  const [templates, meta] = await Promise.all([
    db.dbGetAll("siteTemplates"),
    db.dbGet("meta", "siteIndex"),
  ]);
  return { templates, meta };
}

export async function fetchRepoPreview(url) {
  const base = url.trim().replace(/\/$/, "");
  const indexUrl = `${base}/index.json`;
  let index;
  try {
    index = await fetchJSON(indexUrl, { cache: "no-store" });
  } catch (err) {
    throw new Error(describeFetchError(err, indexUrl));
  }
  const { templates, errors } = await fetchRepoTemplates(base, index);
  return { base, index, templates, errors };
}

export async function addRemoteRepo({ base, index, templates }) {
  const id = crypto.randomUUID();
  const repo = {
    id,
    url: base,
    name: index.name || safeHostname(base),
    contact: index.contact || "",
    indexLastUpdate: index.last_update || null,
    syncedUpdate: index.last_update || null,
    templatePaths: index.templates || [],
    status: "ok",
    lastError: null,
    lastCheckedAt: Date.now(),
  };
  await db.dbPut("remoteRepos", repo);
  await db.dbPutMany(
    "remoteTemplates",
    templates.map((t) => ({
      key: `${id}::${t.path}`,
      repoId: id,
      path: t.path,
      template: t.template,
      fetchedAt: Date.now(),
    })),
  );
  return repo;
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Cheap check run automatically on every page load: refresh the index metadata for a
// remote repo and flag it if the upstream last_update moved on, but do NOT download the
// (potentially large) template bodies here — that only happens via an explicit sync.
export async function checkRemoteRepoForUpdates(repo) {
  const indexUrl = `${repo.url}/index.json`;
  try {
    const index = await fetchJSON(indexUrl, { cache: "no-store" });
    const neverSynced = !repo.syncedUpdate;
    const isNewer =
      index.last_update &&
      repo.syncedUpdate &&
      new Date(index.last_update) > new Date(repo.syncedUpdate);
    const updated = {
      ...repo,
      name: index.name || repo.name,
      contact: index.contact || repo.contact,
      indexLastUpdate: index.last_update || null,
      templatePaths: index.templates || [],
      status: neverSynced || isNewer ? "update-available" : "ok",
      lastError: null,
      lastCheckedAt: Date.now(),
    };
    await db.dbPut("remoteRepos", updated);
    return updated;
  } catch (err) {
    const updated = {
      ...repo,
      status: "error",
      lastError: describeFetchError(err, indexUrl),
      lastCheckedAt: Date.now(),
    };
    await db.dbPut("remoteRepos", updated);
    return updated;
  }
}

export async function syncRemoteRepo(repo) {
  const preview = await fetchRepoPreview(repo.url);
  await db.dbDeleteByPrefix("remoteTemplates", `${repo.id}::`);
  await db.dbPutMany(
    "remoteTemplates",
    preview.templates.map((t) => ({
      key: `${repo.id}::${t.path}`,
      repoId: repo.id,
      path: t.path,
      template: t.template,
      fetchedAt: Date.now(),
    })),
  );
  const updated = {
    ...repo,
    name: preview.index.name || repo.name,
    contact: preview.index.contact || repo.contact,
    indexLastUpdate: preview.index.last_update || null,
    syncedUpdate: preview.index.last_update || null,
    templatePaths: preview.index.templates || [],
    status: preview.errors.length ? "error" : "ok",
    lastError: preview.errors.length
      ? `${preview.errors.length} template(s) failed to load during sync.`
      : null,
    lastCheckedAt: Date.now(),
  };
  await db.dbPut("remoteRepos", updated);
  return { repo: updated, errors: preview.errors };
}

export async function removeRemoteRepo(repoId) {
  await db.dbDelete("remoteRepos", repoId);
  await db.dbDeleteByPrefix("remoteTemplates", `${repoId}::`);
}

export async function getAllRemoteRepos() {
  return db.dbGetAll("remoteRepos");
}

export async function getRemoteTemplatesForRepo(repoId) {
  const all = await db.dbGetAll("remoteTemplates");
  return all.filter((t) => t.repoId === repoId);
}

export async function addLocalTemplate(filename, template) {
  const id = crypto.randomUUID();
  const record = { id, filename, addedAt: Date.now(), template };
  await db.dbPut("localTemplates", record);
  return record;
}

export async function removeLocalTemplate(id) {
  await db.dbDelete("localTemplates", id);
}

export async function getAllLocalTemplates() {
  return db.dbGetAll("localTemplates");
}

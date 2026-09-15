import * as db from "@/db.ts";
import { validateTemplateShape } from "@/templater.ts";
import type {
  FetchErrorLike,
  LocalTemplateRecord,
  RemoteRepo,
  RemoteTemplateRecord,
  RepoFetchResult,
  RepoIndex,
  SiteConfig,
  SiteTemplateRecord,
  Template,
} from "@/types.ts";

// Turns a fetch()/JSON failure into a message that actually tells the user what to do next,
// since the most common failure mode here (a static host with no CORS headers) otherwise
// just surfaces as an opaque "Failed to fetch".
export function describeFetchError(err: unknown, url: string): string {
  if (err instanceof TypeError) {
    return `Could not reach ${url}. Check the address, your connection, and that the server allows cross-origin requests (CORS) — static hosts often need an Access-Control-Allow-Origin header for this to work from another origin.`;
  }
  const fetchErr = err as FetchErrorLike;
  if (fetchErr && fetchErr.httpStatus) {
    return `Server responded with ${fetchErr.httpStatus} for ${url}. Check that the file exists at this location.`;
  }
  if (err instanceof SyntaxError) {
    return `${url} did not contain valid JSON.`;
  }
  return `${url}: ${err instanceof Error ? err.message : String(err)}`;
}

async function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err: FetchErrorLike = new Error(`HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

function joinRepoPath(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

export async function loadSiteConfig(): Promise<SiteConfig> {
  return fetchJSON<SiteConfig>(`${import.meta.env.BASE_URL}config.json`, {
    cache: "no-store",
  });
}

async function fetchRepoTemplates(base: string, index: RepoIndex): Promise<RepoFetchResult> {
  const templates: RepoFetchResult["templates"] = [];
  const errors: RepoFetchResult["errors"] = [];
  for (const path of index.templates || []) {
    const url = joinRepoPath(base, path);
    try {
      const template = await fetchJSON<Template>(url, { cache: "no-store" });
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

export interface ForceSyncSiteRepoResult extends RepoFetchResult {
  index: RepoIndex;
}

// Site repo (declared in config.json) is same-origin and cheap, so it is always
// force-refetched on load rather than compared against a cached last_update.
export async function forceSyncSiteRepo(basePath: string): Promise<ForceSyncSiteRepoResult> {
  // `basePath` (config.json's `templates` field) is documented as relative to the site
  // root, not to whichever page happens to call this — resolve it against BASE_URL
  // explicitly rather than relying on fetch()'s implicit "relative to current document"
  // behavior, which breaks once this is called from a nested page like /editor/.
  const siteRoot = new URL(import.meta.env.BASE_URL, location.href);
  const base = new URL(basePath, siteRoot).href.replace(/\/$/, "");
  const indexUrl = `${base}/index.json`;
  const index = await fetchJSON<RepoIndex>(indexUrl, { cache: "no-store" });
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

export async function getCachedSiteTemplates(): Promise<{
  templates: SiteTemplateRecord[];
  meta: Awaited<ReturnType<typeof db.dbGet<"meta">>>;
}> {
  const [templates, meta] = await Promise.all([
    db.dbGetAll("siteTemplates"),
    db.dbGet("meta", "siteIndex"),
  ]);
  return { templates, meta };
}

export interface RepoPreview extends RepoFetchResult {
  base: string;
  index: RepoIndex;
}

export async function fetchRepoPreview(url: string): Promise<RepoPreview> {
  const base = url.trim().replace(/\/$/, "");
  const indexUrl = `${base}/index.json`;
  let index: RepoIndex;
  try {
    index = await fetchJSON<RepoIndex>(indexUrl, { cache: "no-store" });
  } catch (err) {
    throw new Error(describeFetchError(err, indexUrl));
  }
  const { templates, errors } = await fetchRepoTemplates(base, index);
  return { base, index, templates, errors };
}

export async function addRemoteRepo({ base, index, templates }: RepoPreview): Promise<RemoteRepo> {
  const id = crypto.randomUUID();
  const repo: RemoteRepo = {
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

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Cheap check run automatically on every page load: refresh the index metadata for a
// remote repo and flag it if the upstream last_update moved on, but do NOT download the
// (potentially large) template bodies here — that only happens via an explicit sync.
export async function checkRemoteRepoForUpdates(repo: RemoteRepo): Promise<RemoteRepo> {
  const indexUrl = `${repo.url}/index.json`;
  try {
    const index = await fetchJSON<RepoIndex>(indexUrl, { cache: "no-store" });
    const neverSynced = !repo.syncedUpdate;
    const isNewer = Boolean(
      index.last_update &&
      repo.syncedUpdate &&
      new Date(index.last_update) > new Date(repo.syncedUpdate),
    );
    const updated: RemoteRepo = {
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
    const updated: RemoteRepo = {
      ...repo,
      status: "error",
      lastError: describeFetchError(err, indexUrl),
      lastCheckedAt: Date.now(),
    };
    await db.dbPut("remoteRepos", updated);
    return updated;
  }
}

export async function syncRemoteRepo(
  repo: RemoteRepo,
): Promise<{ repo: RemoteRepo; errors: RepoFetchResult["errors"] }> {
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
  const updated: RemoteRepo = {
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

export async function removeRemoteRepo(repoId: string): Promise<void> {
  await db.dbDelete("remoteRepos", repoId);
  await db.dbDeleteByPrefix("remoteTemplates", `${repoId}::`);
}

export async function getAllRemoteRepos(): Promise<RemoteRepo[]> {
  return db.dbGetAll("remoteRepos");
}

export async function getRemoteTemplatesForRepo(repoId: string): Promise<RemoteTemplateRecord[]> {
  const all = await db.dbGetAll("remoteTemplates");
  return all.filter((t) => t.repoId === repoId);
}

export async function addLocalTemplate(
  filename: string,
  template: Template,
): Promise<LocalTemplateRecord> {
  const id = crypto.randomUUID();
  const record: LocalTemplateRecord = { id, filename, addedAt: Date.now(), template };
  await db.dbPut("localTemplates", record);
  return record;
}

export async function removeLocalTemplate(id: string): Promise<void> {
  await db.dbDelete("localTemplates", id);
}

export async function getAllLocalTemplates(): Promise<LocalTemplateRecord[]> {
  return db.dbGetAll("localTemplates");
}

export async function getLocalTemplate(id: string): Promise<LocalTemplateRecord | undefined> {
  return db.dbGet("localTemplates", id);
}

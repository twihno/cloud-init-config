// Loads the site's own bundled template repo (declared via `templates` in config.json).
// That field is optional — a deployment with no templates configured simply has no site
// repo, which is distinct from one that's configured but failed to load.
import * as store from "@/store.ts";
import type { RepoIndex, TemplateRecord } from "@/types.ts";

export type SiteStatus = "loading" | "disabled" | "ok" | "offline-cache" | "error";

export interface SiteState {
  status: SiteStatus;
  siteName: string | null;
  templates: TemplateRecord[];
  index: RepoIndex | null;
  error: string | null;
}

export const LOADING_SITE_STATE: SiteState = {
  status: "loading",
  siteName: null,
  templates: [],
  index: null,
  error: null,
};

export async function loadSite(): Promise<SiteState> {
  let config;
  try {
    config = await store.loadSiteConfig();
  } catch (err) {
    return {
      status: "error",
      siteName: null,
      templates: [],
      index: null,
      error: `Could not load config.json: ${(err as Error).message}`,
    };
  }
  const siteName = config.name || null;
  if (!config.templates) {
    return { status: "disabled", siteName, templates: [], index: null, error: null };
  }
  try {
    const { index, templates, errors } = await store.forceSyncSiteRepo(config.templates);
    return {
      status: "ok",
      siteName,
      templates,
      index,
      error: errors.length
        ? `${errors.length} site template(s) failed to load: ${errors.map((e) => e.message).join(" ")}`
        : null,
    };
  } catch (err) {
    const cached = await store.getCachedSiteTemplates();
    if (cached.templates.length) {
      return {
        status: "offline-cache",
        siteName,
        templates: cached.templates,
        index: cached.meta?.index ?? null,
        error: `Could not refresh site templates (${(err as Error).message}). Showing the last cached copy.`,
      };
    }
    return {
      status: "error",
      siteName,
      templates: [],
      index: null,
      error: (err as Error).message,
    };
  }
}

// Encodes/decodes which template the editor page should open as URL search params,
// so opening a template is a real navigation (browser back/forward and reload all work)
// rather than in-memory client-side routing.
import type { Selection } from "@/types.ts";

export function homeHref(): string {
  return import.meta.env.BASE_URL;
}

export function editorHref(selection: Selection): string {
  const params = new URLSearchParams();
  params.set("source", selection.source);
  if (selection.source === "site") {
    params.set("path", selection.path);
  } else if (selection.source === "local") {
    params.set("id", selection.id);
  } else {
    params.set("repo", selection.repoId);
    params.set("path", selection.path);
  }
  return `${import.meta.env.BASE_URL}editor/?${params.toString()}`;
}

export function parseSelectionFromSearch(search: string): Selection | null {
  const params = new URLSearchParams(search);
  const source = params.get("source");
  if (source === "site") {
    const path = params.get("path");
    return path ? { source, path } : null;
  }
  if (source === "local") {
    const id = params.get("id");
    return id ? { source, id } : null;
  }
  if (source === "remote") {
    const repoId = params.get("repo");
    const path = params.get("path");
    return repoId && path ? { source, repoId, path } : null;
  }
  return null;
}

// Thin promise wrapper around IndexedDB. One DB, five stores.
import type {
  LocalTemplateRecord,
  RemoteRepo,
  RemoteTemplateRecord,
  SiteIndexMeta,
  SiteTemplateRecord,
} from "@/types.ts";

const DB_NAME = "cloud-init-config";
const DB_VERSION = 1;

export interface StoreMap {
  remoteRepos: RemoteRepo;
  remoteTemplates: RemoteTemplateRecord;
  siteTemplates: SiteTemplateRecord;
  localTemplates: LocalTemplateRecord;
  meta: SiteIndexMeta;
}

export type StoreName = keyof StoreMap;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("remoteRepos")) {
        db.createObjectStore("remoteRepos", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("remoteTemplates")) {
        db.createObjectStore("remoteTemplates", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("siteTemplates")) {
        db.createObjectStore("siteTemplates", { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains("localTemplates")) {
        db.createObjectStore("localTemplates", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbGet<K extends StoreName>(
  storeName: K,
  key: IDBValidKey,
): Promise<StoreMap[K] | undefined> {
  const db = await getDB();
  const tx = db.transaction(storeName, "readonly");
  return wrapRequest(tx.objectStore(storeName).get(key));
}

export async function dbGetAll<K extends StoreName>(storeName: K): Promise<StoreMap[K][]> {
  const db = await getDB();
  const tx = db.transaction(storeName, "readonly");
  return wrapRequest(tx.objectStore(storeName).getAll());
}

export async function dbPut<K extends StoreName>(
  storeName: K,
  value: StoreMap[K],
): Promise<StoreMap[K]> {
  const db = await getDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function dbPutMany<K extends StoreName>(
  storeName: K,
  values: StoreMap[K][],
): Promise<void> {
  if (!values.length) return;
  const db = await getDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  for (const value of values) store.put(value);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function dbDelete(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function dbClear(storeName: StoreName): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Deletes every record in `storeName` whose primary key starts with `prefix`.
// Used to drop all cached templates belonging to one remote repo (key = `${repoId}::${path}`).
export async function dbDeleteByPrefix(storeName: StoreName, prefix: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  const all = await wrapRequest(store.getAll());
  for (const item of all as Array<{ key?: unknown }>) {
    if (typeof item.key === "string" && item.key.startsWith(prefix)) store.delete(item.key);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

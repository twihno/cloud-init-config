// Thin promise wrapper around IndexedDB. One DB, four stores.
const DB_NAME = "cloud-init-config";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
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

function getDB() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

function wrapRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbGet(storeName, key) {
  const db = await getDB();
  const tx = db.transaction(storeName, "readonly");
  return wrapRequest(tx.objectStore(storeName).get(key));
}

export async function dbGetAll(storeName) {
  const db = await getDB();
  const tx = db.transaction(storeName, "readonly");
  return wrapRequest(tx.objectStore(storeName).getAll());
}

export async function dbPut(storeName, value) {
  const db = await getDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function dbPutMany(storeName, values) {
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

export async function dbDelete(storeName, key) {
  const db = await getDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function dbClear(storeName) {
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
export async function dbDeleteByPrefix(storeName, prefix) {
  const db = await getDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  const all = await wrapRequest(store.getAll());
  for (const item of all) {
    if (typeof item.key === "string" && item.key.startsWith(prefix))
      store.delete(item.key);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

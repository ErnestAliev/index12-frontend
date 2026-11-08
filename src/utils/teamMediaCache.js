// Immutable file IDs; cached bytes are isolated by workspace and identity.
const LIMIT = 100 * 1024 * 1024,
  MEMORY_LIMIT = 25 * 1024 * 1024,
  AGE = 30 * 86400000;
const memory = new Map(),
  pending = new Map();
let database,
  writes = Promise.resolve();
const keyFor = (scope, file) => JSON.stringify([scope, file.fileId]);
const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
function db() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const opening = indexedDB.open("index12-team-media", 1);
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore("files");
        opening.result.createObjectStore("metadata", { keyPath: "key" });
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () => reject(new Error("Media storage blocked"));
    }).catch(() => null);
  return database;
}
function remember(key, blob) {
  memory.delete(key);
  memory.set(key, blob);
  let size = [...memory.values()].reduce((n, b) => n + b.size, 0);
  for (const [old, value] of memory) {
    if (size <= MEMORY_LIMIT) break;
    memory.delete(old);
    size -= value.size;
  }
}
async function stored(key) {
  const store = await db();
  if (!store) return null;
  const tx = store.transaction(["files", "metadata"]);
  const [meta, blob] = await Promise.all([
    request(tx.objectStore("metadata").get(key)),
    request(tx.objectStore("files").get(key)),
  ]);
  return meta && Date.now() - meta.saved < AGE && blob instanceof Blob
    ? blob
    : null;
}
export function cacheTeamMedia(scope, file, blob) {
  if (!scope || !file?.fileId || !(blob instanceof Blob) || blob.size > LIMIT)
    return;
  const key = keyFor(scope, file);
  remember(key, blob);
  // Disk writes and eviction must not delay upload completion or preview.
  writes = writes
    .then(async () => {
      const store = await db();
      if (!store) return;
      const metadata = await request(
        store.transaction("metadata").objectStore("metadata").getAll(),
      );
      const now = Date.now(),
        removed = [];
      let total = blob.size;
      for (const entry of metadata.sort((a, b) => b.saved - a.saved)) {
        if (entry.key === key) continue;
        if (now - entry.saved >= AGE || total + entry.size > LIMIT)
          removed.push(entry.key);
        else total += entry.size;
      }
      await new Promise((resolve, reject) => {
        const tx = store.transaction(["files", "metadata"], "readwrite");
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error);
        for (const old of removed) {
          tx.objectStore("files").delete(old);
          tx.objectStore("metadata").delete(old);
        }
        tx.objectStore("files").put(blob, key);
        tx.objectStore("metadata").put({ key, saved: now, size: blob.size });
      });
    })
    .catch(() => {});
}
export async function getTeamMedia(scope, file, fetchBlob) {
  const key = keyFor(scope, file);
  if (memory.has(key)) return memory.get(key);
  if (pending.has(key)) return pending.get(key);
  const loading = (async () => {
    let local;
    try {
      local = await stored(key);
    } catch {
      /* Storage denied: use server. */
    }
    if (local) {
      remember(key, local);
      return local;
    }
    const blob = await fetchBlob();
    cacheTeamMedia(scope, file, blob);
    return blob;
  })();
  pending.set(key, loading);
  try {
    return await loading;
  } finally {
    pending.delete(key);
  }
}

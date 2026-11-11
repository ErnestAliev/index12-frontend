/* Shared by the push worker and app. Store only a clicked destination, never messages. */
(function (root) {
  const database = 'index12-push-handoff', store = 'clicks', key = 'team';
  const ttl = 30 * 60 * 1000;
  function transaction(mode, operation) {
    if (!root.indexedDB) return Promise.resolve(null);
    return new Promise(resolve => {
      let connection, settled = false, result = null;
      const finish = value => {
        if (settled) return;
        settled = true; clearTimeout(timeout); connection?.close(); resolve(value);
      };
      // Storage failure must not prevent opening the application or notification.
      const timeout = setTimeout(() => finish(null), 1200);
      let request;
      try { request = root.indexedDB.open(database, 1); } catch { finish(null); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      };
      request.onerror = request.onblocked = () => finish(null);
      request.onsuccess = () => {
        connection = request.result;
        if (settled) { connection.close(); return; }
        try {
          const tx = connection.transaction(store, mode);
          tx.oncomplete = () => finish(result);
          tx.onerror = tx.onabort = () => finish(null);
          operation(tx.objectStore(store), value => { result = value; });
        } catch { finish(null); }
      };
    });
  }
  root.index12TeamClickStore = {
    write(value) {
      return transaction('readwrite', (rows, result) => { rows.put(value, key); result(value); });
    },
    read() {
      return transaction('readwrite', (rows, result) => {
        const request = rows.get(key);
        request.onsuccess = () => {
          const value = request.result;
          if (value && Number.isFinite(value.savedAt) && Date.now() - value.savedAt >= 0 && Date.now() - value.savedAt < ttl) result(value);
          else if (value) rows.delete(key);
        };
      });
    },
    remove(id) {
      return transaction('readwrite', rows => {
        const request = rows.get(key);
        request.onsuccess = () => { if (request.result?.id === id) rows.delete(key); };
      });
    },
  };
})(globalThis);

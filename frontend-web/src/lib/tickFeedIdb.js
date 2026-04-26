/**
 * Persist tick-feed history in IndexedDB so reloads keep the same tail as in-memory storage.
 * No server round-trip; complements tickFeedStorage.js.
 */

const DB_NAME = 'fxmark-tick-feed';
const DB_VERSION = 1;
const STORE = 'ticks';

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

function getDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('indexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'symbolKey' });
        }
      };
    });
  }
  return dbPromise;
}

/**
 * @returns {Promise<Record<string, Array<{ t: number, p: number }>>>}
 */
export async function idbLoadAllTicks() {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        /** @type {Record<string, Array<{ t: number, p: number }>>} */
        const map = {};
        for (const row of rows) {
          if (row?.symbolKey && Array.isArray(row.ticks)) {
            map[row.symbolKey] = row.ticks;
          }
        }
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    return {};
  }
}

/**
 * @param {string} symbolKey
 * @param {Array<{ t: number, p: number }>} ticks
 */
export async function idbSaveSymbolTicks(symbolKey, ticks) {
  if (!symbolKey || !Array.isArray(ticks)) return;
  try {
    const db = await getDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({
        symbolKey,
        ticks,
        updatedAt: Date.now(),
      });
    });
  } catch (_) {
    /* private mode / quota */
  }
}

/** @param {string} symbolKey */
export async function idbDeleteSymbolTicks(symbolKey) {
  if (!symbolKey) return;
  try {
    const db = await getDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(symbolKey);
    });
  } catch (_) {}
}

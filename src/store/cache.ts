/**
 * A small persistent key-value cache in IndexedDB, with an in-memory layer in front. It holds file
 * text by git blob SHA (content-addressed, so it is right for every repo and branch that has that
 * blob) and whole parsed trees by source. Where IndexedDB is missing (tests, some private windows)
 * it is memory only. Entries unused for 30 days are dropped when the cache opens.
 */
const DB = 'bmad-board-cache';
const STORE = 'kv';
const MAX_AGE = 30 * 86_400_000;

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        resolve(db);
        void prune(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

interface Row {
  at: number;
  value: unknown;
}

async function prune(db: IDBDatabase) {
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const cursor = store.openCursor();
    const cutoff = Date.now() - MAX_AGE;
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      if (((c.value as Row)?.at ?? 0) < cutoff) c.delete();
      c.continue();
    };
  } catch { /* best effort */ }
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T;
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as Row | undefined;
        if (row) {
          memory.set(key, row.value);
          // Touch it so pruning keeps what is still used; cheap and not awaited.
          if (Date.now() - row.at > 86_400_000) void cacheSet(key, row.value);
        }
        resolve(row?.value as T | undefined);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ at: Date.now(), value } satisfies Row, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** How many entries the cache holds, and roughly how much this site stores in the browser. */
export async function cacheStats(): Promise<{ entries: number; bytes?: number }> {
  const db = await open();
  const entries = db
    ? await new Promise<number>((resolve) => {
        try {
          const req = db.transaction(STORE).objectStore(STORE).count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(memory.size);
        } catch {
          resolve(memory.size);
        }
      })
    : memory.size;
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  return { entries, bytes: estimate?.usage };
}

/** Drops every cached file and board, in memory and in IndexedDB. The next load reads everything again. */
export async function clearCache(): Promise<void> {
  memory.clear();
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Forgets everything in memory (tests); the IndexedDB copy stays. */
export function clearMemoryCache() {
  memory.clear();
}

/** A short, stable hash for keys made from long strings (cyrb53). */
export function hashString(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * IndexedDB-backed cache for TTS audio chunks.
 * Key: `${lang}::${text}` → Blob (audio/mpeg)
 *
 * Falls back gracefully (just re-fetches) if IndexedDB is unavailable.
 */

const DB_NAME = "tts-cache";
const STORE = "audio";
const DB_VERSION = 1;
const MAX_ENTRIES = 500; // simple cap to avoid unbounded growth

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("ts", "ts");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function makeKey(text: string, lang: string) {
  return `${lang}::${text}`;
}

export async function getCachedAudio(text: string, lang: string): Promise<Blob | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(makeKey(text, lang));
      req.onsuccess = () => {
        const row = req.result as { blob: Blob } | undefined;
        resolve(row?.blob ?? null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putCachedAudio(text: string, lang: string, blob: Blob): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key: makeKey(text, lang), blob, ts: Date.now() });
    // Best-effort eviction when over cap
    const countReq = tx.objectStore(STORE).count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_ENTRIES) void evictOldest(countReq.result - MAX_ENTRIES);
    };
  } catch {
    /* noop */
  }
}

async function evictOldest(n: number) {
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const idx = tx.objectStore(STORE).index("ts");
    const cursorReq = idx.openCursor();
    let removed = 0;
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor && removed < n) {
        cursor.delete();
        removed++;
        cursor.continue();
      }
    };
  } catch {
    /* noop */
  }
}

/**
 * Returns a playable URL for the chunk:
 *  - object URL from cache if present
 *  - otherwise fetches from /api/tts, caches, and returns object URL
 *  - on any failure, returns the direct /api/tts URL (browser will stream it)
 *
 * Caller is responsible for revoking returned object URLs (URL.revokeObjectURL).
 */
export async function getTtsAudioUrl(
  text: string,
  lang: string
): Promise<{ url: string; revoke: boolean }> {
  const directUrl = `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`;
  try {
    const cached = await getCachedAudio(text, lang);
    if (cached) {
      return { url: URL.createObjectURL(cached), revoke: true };
    }
    const res = await fetch(directUrl);
    if (!res.ok) return { url: directUrl, revoke: false };
    const blob = await res.blob();
    if (blob.size > 0) {
      void putCachedAudio(text, lang, blob);
      return { url: URL.createObjectURL(blob), revoke: true };
    }
    return { url: directUrl, revoke: false };
  } catch {
    return { url: directUrl, revoke: false };
  }
}

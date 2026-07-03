// Persistent cache of CLIP catalog-icon embeddings in IndexedDB.
//
// Embedding the whole icon catalog in-browser is the one-time cost of the CLIP
// classifier (see `lib/clip-embed.ts`). We key each embedding by the icon's stable
// identity (`bucket/path`) plus the model id + scheme version, so the very first
// scan populates the store and every later scan is a fast cache hit. When the model
// or scheme changes, mismatched rows are ignored and recomputed.

import {
  CLIP_EMBED_VERSION,
  CLIP_MODEL_ID,
  embedIconUrl,
} from "@/lib/clip-embed";

export interface CatalogIcon {
  bucket: string;
  path: string;
  iconUrl: string;
}

export function iconKey(icon: { bucket: string; path: string }): string {
  return `${icon.bucket}/${icon.path}`;
}

const DB_NAME = "guild-clip";
const STORE = "clip-embeds";
const DB_VERSION = 1;

interface StoredEmbed {
  key: string;
  model: string;
  version: number;
  vec: ArrayBuffer; // Float32 bytes
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null); // fall back to compute-only, no persistence
    });
  }
  return dbPromise;
}

function readAll(db: IDBDatabase): Promise<Map<string, Float32Array>> {
  return new Promise((resolve) => {
    const out = new Map<string, Float32Array>();
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readonly");
    } catch {
      resolve(out);
      return;
    }
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      for (const row of (req.result as StoredEmbed[]) ?? []) {
        if (row.model === CLIP_MODEL_ID && row.version === CLIP_EMBED_VERSION) {
          out.set(row.key, new Float32Array(row.vec));
        }
      }
      resolve(out);
    };
    req.onerror = () => resolve(out);
  });
}

function writeMany(db: IDBDatabase, rows: StoredEmbed[]): void {
  if (rows.length === 0) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const row of rows) store.put(row);
  } catch {
    /* best-effort persistence */
  }
}

/**
 * Return CLIP embeddings for every catalog icon, computing (and caching) only the
 * ones missing from IndexedDB. `onProgress` reports 0..1 across the compute step.
 */
export async function getCatalogEmbeddings(
  icons: CatalogIcon[],
  onProgress?: (progress: number) => void,
): Promise<Map<string, Float32Array>> {
  const db = await openDb();
  const cached = db ? await readAll(db) : new Map<string, Float32Array>();

  const missing = icons.filter((it) => !cached.has(iconKey(it)));
  if (missing.length === 0) {
    onProgress?.(1);
    return cached;
  }

  const BATCH = 8;
  let done = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const slice = missing.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (it) => ({ key: iconKey(it), vec: await embedIconUrl(it.iconUrl) })),
    );
    const rows: StoredEmbed[] = [];
    for (const r of results) {
      if (!r.vec) continue;
      cached.set(r.key, r.vec);
      rows.push({
        key: r.key,
        model: CLIP_MODEL_ID,
        version: CLIP_EMBED_VERSION,
        vec: r.vec.buffer.slice(0) as ArrayBuffer,
      });
    }
    if (db) writeMany(db, rows);
    done = Math.min(missing.length, i + BATCH);
    onProgress?.(done / missing.length);
  }

  onProgress?.(1);
  return cached;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 5000; // Hard cap — prevents unbounded memory growth
const SWEEP_INTERVAL_MS = 60_000; // Evict expired entries every 60s

const cacheStore = new Map<string, CacheEntry<any>>();

// Periodic sweep to evict expired entries (prevents memory leaks on long-running servers)
setInterval(() => {
  const now = Date.now();
  let evicted = 0;
  for (const [key, entry] of cacheStore.entries()) {
    if (now > entry.expiresAt) {
      cacheStore.delete(key);
      evicted++;
    }
  }
  if (evicted > 0) {
    console.log(`[Cache Sweep]: Evicted ${evicted} expired entries. Active: ${cacheStore.size}`);
  }
}, SWEEP_INTERVAL_MS).unref(); // .unref() so the timer doesn't prevent process exit

// In-Memory cache engine fallback (with eviction & size limits)
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const entry = cacheStore.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      cacheStore.delete(key);
      return null;
    }

    return entry.value as T;
  },

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    // Enforce max size — evict oldest entries when cap is reached
    if (cacheStore.size >= MAX_CACHE_ENTRIES) {
      const firstKey = cacheStore.keys().next().value;
      if (firstKey !== undefined) {
        cacheStore.delete(firstKey);
      }
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    cacheStore.set(key, { value, expiresAt });
  },

  async delete(key: string): Promise<void> {
    cacheStore.delete(key);
  },

  // Invalidate cache by namespace pattern (e.g. "stats:*")
  async invalidatePattern(pattern: string): Promise<void> {
    const cleanPattern = pattern.replace("*", "");
    let count = 0;

    for (const key of cacheStore.keys()) {
      if (key.startsWith(cleanPattern)) {
        cacheStore.delete(key);
        count++;
      }
    }

    if (count > 0) {
      console.log(`[Cache] Invalidated ${count} keys matching pattern: "${pattern}"`);
    }
  },

  async clear(): Promise<void> {
    cacheStore.clear();
  }
};

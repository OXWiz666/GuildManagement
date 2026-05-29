interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cacheStore = new Map<string, CacheEntry<any>>();

// In-Memory cache engine fallback (highly optimized)
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

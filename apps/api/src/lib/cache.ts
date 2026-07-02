interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 5000; // Hard cap — prevents unbounded memory growth
const SWEEP_INTERVAL_MS = 60_000; // Evict expired entries every 60s

const cacheStore = new Map<string, CacheEntry<any>>();

// ─── Hit/Miss instrumentation ───────────────────
// Lightweight counters so cache effectiveness can be observed without an
// external metrics backend. Surfaced via the /api/health endpoint and the
// periodic sweep log.
const metrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  evictions: 0,
};

export function getCacheStats() {
  const total = metrics.hits + metrics.misses;
  const hitRate = total > 0 ? metrics.hits / total : 0;
  return {
    ...metrics,
    size: cacheStore.size,
    hitRate: Number(hitRate.toFixed(4)),
  };
}

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
  metrics.evictions += evicted;
  if (evicted > 0) {
    const stats = getCacheStats();
    console.log(
      `[Cache Sweep]: Evicted ${evicted} expired entries. Active: ${stats.size}. ` +
        `Hit rate: ${(stats.hitRate * 100).toFixed(1)}% (${metrics.hits}/${metrics.hits + metrics.misses})`,
    );
  }
}, SWEEP_INTERVAL_MS).unref(); // .unref() so the timer doesn't prevent process exit

// In-Memory cache engine fallback (with eviction & size limits)
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const entry = cacheStore.get(key);
    if (!entry) {
      metrics.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      cacheStore.delete(key);
      metrics.misses++;
      return null;
    }

    metrics.hits++;
    return entry.value as T;
  },

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    // Enforce max size — evict oldest entries when cap is reached
    if (cacheStore.size >= MAX_CACHE_ENTRIES) {
      const firstKey = cacheStore.keys().next().value;
      if (firstKey !== undefined) {
        cacheStore.delete(firstKey);
        metrics.evictions++;
      }
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    cacheStore.set(key, { value, expiresAt });
    metrics.sets++;
  },

  /**
   * Read-through helper: return the cached value when present, otherwise run
   * `loader`, cache its result, and return it. Collapses the repetitive
   * get → (miss) → compute → set pattern scattered across the routes into a
   * single call, and guarantees the hit/miss counters stay accurate.
   */
  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
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

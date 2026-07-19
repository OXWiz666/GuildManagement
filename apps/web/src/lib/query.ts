import { useState, useEffect, useCallback, useRef } from "react";

// Global cache store for frontend query results
const globalQueryCache = new Map<string, { data: unknown; timestamp: number }>();
const inFlightQueries = new Map<string, Promise<unknown>>();
type QueryCacheEvent = "updated" | "invalidated";
type QueryCacheListener = (event: QueryCacheEvent) => void;

const listeners = new Map<string, Set<QueryCacheListener>>();

function notifyQueryListeners(key: string, event: QueryCacheEvent) {
  listeners.get(key)?.forEach((listener) => listener(event));
}

export interface QueryResult<T> {
  data: T | null;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => Promise<void>;
}

export interface QueryOptions {
  staleTime?: number;
  persist?: boolean;
  enabled?: boolean;
}

export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: QueryOptions = {}
): QueryResult<T> {
  const staleTime = options.staleTime ?? 15000; // default 15s stale window
  const persist = options.persist ?? false;
  const enabled = options.enabled ?? true;
  const cacheKey = key;
  const lsKey = `query_cache:${key}`;

  // Store fetcher in a ref to avoid including it in dependency arrays
  // This prevents infinite re-render loops when callers pass inline arrow functions
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const getCached = useCallback((allowStale = false) => {
    // 1. Check memory cache
    const cached = globalQueryCache.get(cacheKey);
    if (cached && (allowStale || Date.now() - cached.timestamp < staleTime)) {
      return cached.data as T;
    }

    // 2. Fallback to localStorage if persist is enabled
    if (persist && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(lsKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (allowStale || Date.now() - parsed.timestamp < staleTime) {
            // Pre-populate memory cache to speed up next checks
            globalQueryCache.set(cacheKey, { data: parsed.data, timestamp: parsed.timestamp });
            return parsed.data as T;
          }
        }
      } catch (e) {
        console.warn(`[Query Cache] Failed to read cached data for key "${key}":`, e);
      }
    }

    return null;
  }, [cacheKey, staleTime, persist, lsKey, key]);

  const [data, setData] = useState<T | null>(() => getCached(true));
  const [isLoading, setIsLoading] = useState(() => enabled && getCached(true) === null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchData = useCallback(async (force = false) => {
    const cached = globalQueryCache.get(cacheKey);
    if (!enabled) {
      setIsLoading(false);
      setIsFetching(false);
      return;
    }

    if (!force && cached && Date.now() - cached.timestamp < staleTime) {
      setData(cached.data as T);
      setIsLoading(false);
      return;
    }

    setIsFetching(true);
    
    // Check if we have stale/cached data in localStorage to display while fetching
    let hasCachedData = !!cached;
    if (cached) {
      setData(cached.data as T);
      setIsLoading(false);
    }
    if (!hasCachedData && persist && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(lsKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          setData(parsed.data);
          setIsLoading(false);
          hasCachedData = true;
        }
      } catch {
        // quiet fail
      }
    }

    // Only set isLoading to true if we have absolutely no cached data to display
    if (!hasCachedData) {
      setIsLoading(true);
    }

    try {
      let request = inFlightQueries.get(cacheKey) as Promise<T> | undefined;
      if (!request) {
        request = fetcherRef.current().finally(() => {
          inFlightQueries.delete(cacheKey);
        });
        inFlightQueries.set(cacheKey, request);
      }

      const result = await request;
      const timestamp = Date.now();
      
      // Save to memory cache
      globalQueryCache.set(cacheKey, { data: result, timestamp });

      // Save to localStorage if requested
      if (persist && typeof window !== "undefined") {
        try {
          localStorage.setItem(lsKey, JSON.stringify({ data: result, timestamp }));
        } catch (e) {
          console.warn(`[Query Cache] Failed to persist key "${key}" to localStorage:`, e);
        }
      }

      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [cacheKey, staleTime, persist, lsKey, enabled, key]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refreshTimer = setTimeout(() => {
      void fetchData();
    }, 0);

    // Listen for query key invalidations
    if (!listeners.has(cacheKey)) {
      listeners.set(cacheKey, new Set());
    }
    const handler: QueryCacheListener = (event) => {
      if (event === "updated") {
        const freshCached = getCached();
        if (freshCached !== null) {
          setData(freshCached);
          setIsLoading(false);
          setError(null);
          return;
        }
      }
      fetchData(true);
    };
    listeners.get(cacheKey)!.add(handler);

    return () => {
      clearTimeout(refreshTimer);
      const set = listeners.get(cacheKey);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          listeners.delete(cacheKey);
        }
      }
    };
  }, [cacheKey, fetchData, getCached, enabled]);

  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  return {
    data,
    isLoading: enabled ? isLoading : false,
    isFetching: enabled ? isFetching : false,
    error,
    refetch
  };
}

/**
 * Warm the cache for `key` without mounting a component — call on link hover/
 * focus so the data is already in `globalQueryCache` by the time the user
 * navigates (pairs with `useQuery`'s own key so the mounted hook hits cache
 * instead of refetching).
 */
export function prefetchQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: QueryOptions = {}
): Promise<T> {
  const staleTime = options.staleTime ?? 15000;
  const cached = globalQueryCache.get(key);
  if (cached && Date.now() - cached.timestamp < staleTime) {
    return Promise.resolve(cached.data as T);
  }

  let request = inFlightQueries.get(key) as Promise<T> | undefined;
  if (!request) {
    request = fetcher().finally(() => {
      inFlightQueries.delete(key);
    });
    inFlightQueries.set(key, request);
  }

  return request.then((result) => {
    const timestamp = Date.now();
    globalQueryCache.set(key, { data: result, timestamp });
    if (options.persist && typeof window !== "undefined") {
      try {
        localStorage.setItem(`query_cache:${key}`, JSON.stringify({ data: result, timestamp }));
      } catch {
        // quiet fail
      }
    }
    notifyQueryListeners(key, "updated");
    return result;
  });
}

export const queryClient = {
  /**
   * Optimistic write: immediately replace the cached value for `key` (so every
   * mounted `useQuery(key, ...)` re-renders with the new data right away),
   * returning a `rollback()` to restore the previous value if the mutation
   * that triggered this later fails.
   */
  setQueryData<T>(key: string, updater: T | ((old: T | null) => T)): { rollback: () => void } {
    const previous = globalQueryCache.get(key);
    const previousData = (previous?.data ?? null) as T | null;
    const nextData =
      typeof updater === "function" ? (updater as (old: T | null) => T)(previousData) : updater;

    globalQueryCache.set(key, { data: nextData, timestamp: Date.now() });
    notifyQueryListeners(key, "updated");

    return {
      rollback: () => {
        if (previous) {
          globalQueryCache.set(key, previous);
        } else {
          globalQueryCache.delete(key);
        }
        notifyQueryListeners(key, "updated");
      },
    };
  },

  invalidateQueries(keyPattern: string) {
    const cleanPattern = keyPattern.replace("*", "");
    
    // Invalidate memory caches by setting timestamp to 0 (marking as stale but retaining data)
    for (const key of globalQueryCache.keys()) {
      if (key.startsWith(cleanPattern)) {
        const entry = globalQueryCache.get(key);
        if (entry) {
          entry.timestamp = 0;
        }
        inFlightQueries.delete(key);
        const set = listeners.get(key);
        if (set) {
          set.forEach((listener) => listener("invalidated"));
        }
      }
    }

    // Invalidate localStorage persistent caches by setting timestamp to 0
    if (typeof window !== "undefined") {
      try {
        const matchingKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const lsKey = localStorage.key(i);
          if (lsKey && lsKey.startsWith(`query_cache:${cleanPattern}`)) {
            matchingKeys.push(lsKey);
          }
        }

        for (const lsKey of matchingKeys) {
          const stored = localStorage.getItem(lsKey);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              parsed.timestamp = 0;
              localStorage.setItem(lsKey, JSON.stringify(parsed));
            } catch {
              localStorage.removeItem(lsKey);
            }
          }
        }
      } catch (e) {
        console.warn(`[Query Cache] Failed to clear query_cache keys for pattern "${cleanPattern}":`, e);
      }
    }
  }
};

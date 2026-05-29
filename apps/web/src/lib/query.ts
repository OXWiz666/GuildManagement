import { useState, useEffect, useCallback } from "react";

// Global cache store for frontend query results
const globalQueryCache = new Map<string, { data: any; timestamp: number }>();
const listeners = new Map<string, Set<() => void>>();

export interface QueryResult<T> {
  data: T | null;
  isLoading: boolean;
  isFetching: boolean;
  error: any;
  refetch: () => Promise<void>;
}

export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { staleTime?: number } = {}
): QueryResult<T> {
  const staleTime = options.staleTime ?? 15000; // default 15s stale window
  const cacheKey = key;

  const getCached = useCallback(() => {
    const cached = globalQueryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < staleTime) {
      return cached.data as T;
    }
    return null;
  }, [cacheKey, staleTime]);

  const [data, setData] = useState<T | null>(getCached());
  const [isLoading, setIsLoading] = useState(!getCached());
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<any>(null);

  const fetchData = useCallback(async (force = false) => {
    const cached = globalQueryCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.timestamp < staleTime) {
      setData(cached.data);
      setIsLoading(false);
      return;
    }

    setIsFetching(true);
    try {
      const result = await fetcher();
      globalQueryCache.set(cacheKey, { data: result, timestamp: Date.now() });
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [cacheKey, staleTime, fetcher]);

  useEffect(() => {
    fetchData();

    // Listen for query key invalidations
    if (!listeners.has(cacheKey)) {
      listeners.set(cacheKey, new Set());
    }
    const handler = () => {
      fetchData(true);
    };
    listeners.get(cacheKey)!.add(handler);

    return () => {
      const set = listeners.get(cacheKey);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          listeners.delete(cacheKey);
        }
      }
    };
  }, [cacheKey, fetchData]);

  return {
    data,
    isLoading,
    isFetching,
    error,
    refetch: () => fetchData(true)
  };
}

export const queryClient = {
  invalidateQueries(keyPattern: string) {
    const cleanPattern = keyPattern.replace("*", "");
    for (const key of globalQueryCache.keys()) {
      if (key.startsWith(cleanPattern)) {
        globalQueryCache.delete(key);
        const set = listeners.get(key);
        if (set) {
          set.forEach((listener) => listener());
        }
      }
    }
  }
};

import { Redis } from "@upstash/redis";
import { env } from "../config/env";
import { cache as memoryCache } from "./cache";

// Design: see /docs/redis-caching-design.md. This client intentionally does
// NOT expose an `invalidatePattern`/`KEYS`/`SCAN`-based delete — every call
// site names the exact key(s) it wants gone, either directly or via a small
// bounded index Set (see `smembers`/`sadd` below). That's the whole point of
// this layer: targeted invalidation, never a keyspace scan.

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const inFlightLoads = new Map<string, Promise<unknown>>();

if (!redis) {
  console.warn(
    "[Redis] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set — falling back to the in-memory cache. " +
      "Fine for local dev; every server instance in production should have Redis configured, or cached data " +
      "won't be shared across instances.",
  );
}

/**
 * Same shape as the existing in-memory `cache` (get/set/getOrSet/delete), so
 * migrating a call site is an import swap — see "Rollout" in the design doc.
 * Backed by Upstash Redis when configured, otherwise transparently delegates
 * to the in-memory cache so every environment keeps working.
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return memoryCache.get<T>(key);
    const value = await redis.get<T>(key);
    return value ?? null;
  },

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!redis) return memoryCache.set(key, value, ttlSeconds);
    await redis.set(key, value, { ex: ttlSeconds });
  },

  /**
   * Claim a key only when it does not already exist.
   *
   * Used by the Discord bot to dedupe gateway events. With Upstash this is a
   * Redis SET NX, so two bot processes cannot both claim the same message id.
   */
  async setIfAbsent<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    if (!redis) return memoryCache.setIfAbsent(key, value, ttlSeconds);
    const result = await redis.set(key, value, { ex: ttlSeconds, nx: true });
    return result === "OK";
  },

  /** Read-through: return the cached value, or run `loader`, cache it, and return it. */
  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const inFlight = inFlightLoads.get(key) as Promise<T> | undefined;
    if (inFlight) return inFlight;

    const load = (async () => {
      const value = await loader();
      await this.set(key, value, ttlSeconds);
      return value;
    })().finally(() => {
      inFlightLoads.delete(key);
    });

    inFlightLoads.set(key, load);
    return load;
  },

  /** Delete one exact key. */
  async del(key: string): Promise<void> {
    if (!redis) return memoryCache.delete(key);
    await redis.del(key);
  },

  /**
   * Delete a list of exact, already-known keys in one round trip (Pattern A
   * applied to more than one key at once — e.g. clearing both
   * `guild:members` and `guild:members-simple` together). Still not a
   * pattern/scan: every key in `keys` was named by the caller.
   */
  async delMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    if (!redis) {
      await Promise.all(keys.map((k) => memoryCache.delete(k)));
      return;
    }
    await redis.del(...keys);
  },

  // ─── Index sets — for the bounded fan-out cases only (Pattern B) ───

  /** Add a member (e.g. a guildId) to a bounded index set, refreshing its TTL. */
  async sadd(key: string, member: string, ttlSeconds: number): Promise<void> {
    if (!redis) return; // index-set fan-out fallback isn't needed for the single-process in-memory cache
    await redis.sadd(key, member);
    await redis.expire(key, ttlSeconds);
  },

  /** Read all members of an index set (bounded — e.g. guildIds in one faction). */
  async smembers(key: string): Promise<string[]> {
    if (!redis) return [];
    return redis.smembers(key);
  },

  // ─── Sorted sets — leaderboards (§10) ───

  /** Increment one member's score by `delta` — the whole point being no cache to invalidate. */
  async zincrby(key: string, delta: number, member: string, ttlSeconds: number): Promise<void> {
    if (!redis) return;
    await redis.zincrby(key, delta, member);
    await redis.expire(key, ttlSeconds);
  },

  /** Set a member's score outright — used by the periodic rebuild job (`GT` semantics avoid regressing a newer score). */
  async zaddGreaterThan(key: string, score: number, member: string): Promise<void> {
    if (!redis) return;
    await redis.zadd(key, { gt: true }, { score, member });
  },

  /** Top-N (descending) with scores, for a leaderboard view. */
  async ztopN(key: string, n: number): Promise<Array<{ member: string; score: number }>> {
    if (!redis) return [];
    const raw = await redis.zrange(key, 0, n - 1, { rev: true, withScores: true });
    const out: Array<{ member: string; score: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      out.push({ member: String(raw[i]), score: Number(raw[i + 1]) });
    }
    return out;
  },

  /** One member's descending rank (0-based) and score, or null if unranked. */
  async zrank(key: string, member: string): Promise<{ rank: number; score: number } | null> {
    if (!redis) return null;
    const [rank, score] = await Promise.all([
      redis.zrevrank(key, member),
      redis.zscore(key, member),
    ]);
    if (rank === null || score === null) return null;
    return { rank, score: Number(score) };
  },
};

export const isRedisConfigured = redis !== null;

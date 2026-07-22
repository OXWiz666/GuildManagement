import { redisCache, cacheKeys, isRedisConfigured } from "@guild/core";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface ApiRateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Fixed-window limiter for the public API, keyed by the caller's API key
 * rather than a Discord id. Same window-bucketing approach as the bot's
 * Discord-facing RateLimiter (../middleware/rateLimit.ts) — kept separate
 * because that one's `enforce()` throws a Discord-embed-shaped error, which
 * doesn't fit an HTTP response.
 */
export async function consumeApiBudget(apiKey: string): Promise<ApiRateLimitDecision> {
  const limit = env.RATE_LIMIT_API_PER_MIN;
  const windowSeconds = 60;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const window = Math.floor(nowSeconds / windowSeconds);
  const resetInSeconds = (window + 1) * windowSeconds - nowSeconds;
  const key = cacheKeys.botApiRate(apiKey, window);

  try {
    const current = (await redisCache.get<number>(key)) ?? 0;
    const next = current + 1;

    if (next > limit) {
      return { allowed: false, remaining: 0, resetInSeconds };
    }

    await redisCache.set(key, next, resetInSeconds);
    return { allowed: true, remaining: Math.max(0, limit - next), resetInSeconds };
  } catch (error) {
    // Fail open, same reasoning as the Discord rate limiter: a cache outage
    // must not turn into a total API outage.
    logger.warn("Public API rate limiter unavailable — allowing request", {
      redis: isRedisConfigured,
      err: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true, remaining: limit, resetInSeconds };
  }
}

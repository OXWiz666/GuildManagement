import { redisCache, cacheKeys, isRedisConfigured } from "@guild/core";
import { env } from "../config/env.js";
import { UserFacingError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export type RateLimitKind = "command" | "scan";

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  resetInSeconds: number;
}

/**
 * Per-user fixed-window rate limiting, backed by the shared Redis layer.
 *
 * Why fixed-window: it's what the website's API already uses
 * (apps/web/src/server/hono/middleware/ratelimit.ts), and matching it keeps one
 * mental model. The classic burst-at-the-boundary weakness is irrelevant here —
 * these budgets exist to stop a member spamming the bot and to protect the
 * single OCR worker, not to meter a paid API.
 *
 * Two budgets, deliberately separate:
 *   • commands — generous; a chatty member shouldn't be silenced.
 *   • scans — tight; OCR is CPU-bound and serialized behind ONE worker, so a
 *     single user looping screenshots would queue every other member's scan
 *     behind them. This is the backpressure that prevents that.
 *
 * Redis-backed so the budget is shared if you ever run more than one instance;
 * falls back to the in-memory cache automatically when Redis isn't configured
 * (see @guild/core lib/redis), which is correct for the single-instance default.
 */
export class RateLimiter {
  constructor(private readonly now: () => number = Date.now) {}

  private config(kind: RateLimitKind): { limit: number; windowSeconds: number } {
    return kind === "scan"
      ? { limit: env.RATE_LIMIT_SCANS_PER_HOUR, windowSeconds: 3600 }
      : { limit: env.RATE_LIMIT_COMMANDS_PER_MIN, windowSeconds: 60 };
  }

  private key(kind: RateLimitKind, discordId: string, window: number): string {
    return kind === "scan"
      ? cacheKeys.discordRateScans(discordId, window)
      : cacheKeys.discordRateCommands(discordId, window);
  }

  /**
   * Consume one unit of budget.
   *
   * The window number is derived from the clock (epoch / windowSeconds) rather
   * than stored, so the counter key rotates by itself and expired windows are
   * reclaimed by TTL — there is nothing to sweep.
   */
  async consume(kind: RateLimitKind, discordId: string): Promise<RateLimitDecision> {
    const { limit, windowSeconds } = this.config(kind);

    const nowSeconds = Math.floor(this.now() / 1000);
    const window = Math.floor(nowSeconds / windowSeconds);
    const resetInSeconds = (window + 1) * windowSeconds - nowSeconds;
    const key = this.key(kind, discordId, window);

    try {
      const current = (await redisCache.get<number>(key)) ?? 0;
      const next = current + 1;

      if (next > limit) {
        return { allowed: false, remaining: 0, resetInSeconds };
      }

      // Set the TTL to the remaining window, so the key dies with its window.
      await redisCache.set(key, next, resetInSeconds);

      return { allowed: true, remaining: Math.max(0, limit - next), resetInSeconds };
    } catch (error) {
      // Fail OPEN. If Redis is down, refusing every command would turn a cache
      // outage into a total bot outage — a far worse failure than briefly
      // unmetered usage. The OCR worker is still serialized regardless, so the
      // expensive path stays protected by its own queue.
      logger.warn("Rate limiter unavailable — allowing request", {
        kind,
        redis: isRedisConfigured,
        err: error instanceof Error ? error.message : String(error),
      });
      return { allowed: true, remaining: limit, resetInSeconds };
    }
  }

  /** Consume, or throw a user-facing error naming the wait. */
  async enforce(kind: RateLimitKind, discordId: string): Promise<void> {
    const decision = await this.consume(kind, discordId);
    if (decision.allowed) return;

    const wait = formatWait(decision.resetInSeconds);

    throw new UserFacingError(
      kind === "scan"
        ? `You've hit the screenshot scan limit (${env.RATE_LIMIT_SCANS_PER_HOUR}/hour).`
        : `You're sending commands too quickly (${env.RATE_LIMIT_COMMANDS_PER_MIN}/min).`,
      `Try again in ${wait}.` +
        (kind === "scan" ? " You can still update manually with `!cp <value>`." : ""),
    );
  }
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

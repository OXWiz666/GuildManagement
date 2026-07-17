import { env } from "../config/env.js";
import type { CpRepository } from "../repositories/cp.repository.js";
import { UserFacingError } from "../utils/errors.js";
import { formatNumber } from "../embeds/builders.js";

export interface CpUpdateResult {
  oldCp: number | null;
  newCp: number;
  delta: number | null;
  rank: number | null;
  /** False when the submitted value equals the stored one. */
  changed: boolean;
}

export class CpService {
  constructor(private readonly cp: CpRepository) {}

  /**
   * Parse and validate a user-supplied CP figure.
   *
   * Accepts "985000", "985,000" and "985 000" — players copy CP straight out of
   * the game UI, which renders separators. Rejects decimals, negatives, and
   * anything above the configured ceiling.
   */
  parseCpInput(raw: string): number {
    const cleaned = raw.trim().replace(/[,\s_]/g, "");

    if (!/^\d+$/.test(cleaned)) {
      throw new UserFacingError(
        `\`${raw}\` isn't a valid Combat Power value.`,
        "Enter a whole number — for example `!cp 985000`.",
      );
    }

    // Parse before range-checking: a 30-digit string is still "all digits" but
    // overflows Number's safe range, and Postgres INTEGER caps at ~2.1 billion.
    const value = Number(cleaned);

    if (!Number.isSafeInteger(value)) {
      throw new UserFacingError(
        `\`${raw}\` is too large to be a Combat Power value.`,
      );
    }

    if (value < 0) {
      throw new UserFacingError("Combat Power can't be negative.");
    }

    if (value > env.CP_MAX_VALUE) {
      throw new UserFacingError(
        `That's above the maximum allowed Combat Power (${formatNumber(env.CP_MAX_VALUE)}).`,
        "Double-check the number — or ask an officer to raise the cap if it's real.",
      );
    }

    return value;
  }

  async getProfile(memberId: string) {
    return this.cp.getProfile(memberId);
  }

  /** Update CP and return enough context to render the change embed. */
  async updateCp(params: {
    memberId: string;
    guildId: string;
    userId: string;
    rawValue: string;
    actorId: string;
    actorDiscordId: string;
  }): Promise<CpUpdateResult> {
    const newCp = this.parseCpInput(params.rawValue);

    const result = await this.cp.updateCp({
      memberId: params.memberId,
      guildId: params.guildId,
      userId: params.userId,
      newCp,
      actorId: params.actorId,
      actorDiscordId: params.actorDiscordId,
    });

    // Null means "same value" — report it as a no-op so the caller can skip
    // both the history noise and a "⬆ CP Updated +0" notification.
    if (result === null) {
      const rank = await this.cp.getRank({ guildId: params.guildId, cp: newCp });
      return { oldCp: newCp, newCp, delta: 0, rank, changed: false };
    }

    const rank = await this.cp.getRank({ guildId: params.guildId, cp: result.newCp });
    return { ...result, rank, changed: true };
  }

  async leaderboard(guildId: string, page = 1, pageSize = 10) {
    // Pages are 1-based for users; clamp so `!cp leaderboard 0` isn't a
    // negative offset (which Prisma rejects).
    const safePage = Math.max(1, Math.floor(page));
    const offset = (safePage - 1) * pageSize;

    const { rows, total } = await this.cp.leaderboard({ guildId, offset, limit: pageSize });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return { rows, total, page: safePage, totalPages };
  }

  async history(memberId: string, limit = 10) {
    return this.cp.history(memberId, limit);
  }

  async getRank(guildId: string, cp: number | null) {
    return this.cp.getRank({ guildId, cp });
  }

  /** Aggregate guild CP plus weekly/monthly growth, for the scheduled monitor. */
  async guildStats(guildId: string, now: Date = new Date()) {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [stats, weeklyGrowth, monthlyGrowth] = await Promise.all([
      this.cp.stats(guildId),
      this.cp.growthSince(guildId, weekAgo),
      this.cp.growthSince(guildId, monthAgo),
    ]);

    return { ...stats, weeklyGrowth, monthlyGrowth };
  }

  async writeSnapshot(guildId: string) {
    const stats = await this.cp.stats(guildId);
    await this.cp.writeSnapshot(guildId, stats);
    return stats;
  }
}

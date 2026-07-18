import { prisma } from "@guild/db";

export interface CpProfile {
  memberId: string;
  userId: string;
  ign: string | null;
  displayName: string;
  role: string;
  cp: number | null;
  cpUpdatedAt: Date | null;
  className: string | null;
}

export interface LeaderboardRow {
  rank: number;
  ign: string | null;
  displayName: string;
  className: string | null;
  cp: number | null;
  cpUpdatedAt: Date | null;
}

export interface CpHistoryRow {
  createdAt: Date;
  oldCp: number | null;
  newCp: number;
  delta: number | null;
  source: string;
}

export interface GuildCpStats {
  highest: number | null;
  lowest: number | null;
  average: number | null;
  total: bigint;
  counted: number;
}

export class CpRepository {
  async getProfile(memberId: string): Promise<CpProfile | null> {
    const row = await prisma.guildMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        userId: true,
        ign: true,
        role: true,
        cp: true,
        cpUpdatedAt: true,
        class: true,
        user: { select: { displayName: true } },
      },
    });

    if (!row) return null;

    return {
      memberId: row.id,
      userId: row.userId,
      ign: row.ign,
      displayName: row.user.displayName,
      role: row.role,
      cp: row.cp,
      cpUpdatedAt: row.cpUpdatedAt,
      className: row.class,
    };
  }

  /**
   * Set a member's CP and append a history row, atomically.
   *
   * The read of the old value and the write of the new one are in ONE
   * transaction: two `!cp` updates racing would otherwise both read the same
   * "old" CP and write history rows whose deltas don't reconcile with the
   * member's actual CP. Returns null if the value is unchanged, so callers can
   * skip a pointless notification.
   */
  async updateCp(params: {
    memberId: string;
    guildId: string;
    userId: string;
    newCp: number;
    actorId: string;
    actorDiscordId: string;
    source?: "DISCORD" | "DISCORD_OCR" | "WEB" | "SYSTEM";
    // ─── OCR provenance (source = DISCORD_OCR) ───
    imageUrl?: string;
    ocrConfidence?: number;
    flagged?: boolean;
    flagReason?: string | null;
  }): Promise<{ oldCp: number | null; newCp: number; delta: number | null } | null> {
    const { memberId, guildId, userId, newCp, actorId, actorDiscordId } = params;
    const source = params.source ?? "DISCORD";

    return prisma.$transaction(async (tx) => {
      const current = await tx.guildMember.findUnique({
        where: { id: memberId },
        select: { cp: true },
      });

      const oldCp = current?.cp ?? null;
      if (oldCp === newCp) return null;

      const delta = oldCp === null ? null : newCp - oldCp;
      const now = new Date();

      await tx.guildMember.update({
        where: { id: memberId },
        data: { cp: newCp, cpUpdatedAt: now, cpUpdatedById: actorId },
      });

      await tx.combatPowerHistory.create({
        data: {
          guildId,
          memberId,
          userId,
          oldCp,
          newCp,
          delta,
          source,
          actorId,
          actorDiscordId,
          ...(params.imageUrl === undefined ? {} : { imageUrl: params.imageUrl }),
          ...(params.ocrConfidence === undefined ? {} : { ocrConfidence: params.ocrConfidence }),
          flagged: params.flagged ?? false,
          ...(params.flagReason == null ? {} : { flagReason: params.flagReason }),
        },
      });

      return { oldCp, newCp, delta };
    });
  }

  /** Set a member's class — only ever called for a blank one (see CpScanService). */
  async setClass(memberId: string, className: string): Promise<void> {
    await prisma.guildMember.update({
      where: { id: memberId },
      data: { class: className },
    });
  }

  /** Flagged scans awaiting officer review, newest first. */
  async listFlagged(guildId: string, limit = 10) {
    return prisma.combatPowerHistory.findMany({
      where: { guildId, flagged: true },
      select: {
        id: true,
        createdAt: true,
        oldCp: true,
        newCp: true,
        delta: true,
        flagReason: true,
        imageUrl: true,
        ocrConfidence: true,
        member: { select: { ign: true, user: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * CP leaderboard. Paginated in SQL (skip/take) rather than by slicing a
   * full fetch — a large guild would otherwise pull every row to show ten.
   */
  async leaderboard(params: {
    guildId: string;
    offset?: number;
    limit?: number;
  }): Promise<{ rows: LeaderboardRow[]; total: number }> {
    const { guildId, offset = 0, limit = 10 } = params;

    const where = { guildId, isActive: true, cp: { not: null } };

    const [rows, total] = await Promise.all([
      prisma.guildMember.findMany({
        where,
        select: {
          ign: true,
          class: true,
          cp: true,
          cpUpdatedAt: true,
          user: { select: { displayName: true } },
        },
        orderBy: [{ cp: "desc" }, { id: "asc" }],
        skip: offset,
        take: limit,
      }),
      prisma.guildMember.count({ where }),
    ]);

    return {
      rows: rows.map((row, index) => ({
        rank: offset + index + 1,
        ign: row.ign,
        displayName: row.user.displayName,
        className: row.class,
        cp: row.cp,
        cpUpdatedAt: row.cpUpdatedAt,
      })),
      total,
    };
  }

  /** A member's rank within their guild (1-based), or null if they have no CP. */
  async getRank(params: { guildId: string; cp: number | null }): Promise<number | null> {
    if (params.cp === null) return null;

    const ahead = await prisma.guildMember.count({
      where: {
        guildId: params.guildId,
        isActive: true,
        cp: { gt: params.cp },
      },
    });

    return ahead + 1;
  }

  async history(memberId: string, limit = 10): Promise<CpHistoryRow[]> {
    return prisma.combatPowerHistory.findMany({
      where: { memberId },
      select: { createdAt: true, oldCp: true, newCp: true, delta: true, source: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Guild-wide CP aggregate.
   *
   * A single `aggregate` — min/max/avg/sum/count computed by Postgres in one
   * round trip, rather than fetching members and reducing in JS. This is the
   * brief's "avoid JavaScript loops" applied where it actually matters.
   */
  async stats(guildId: string): Promise<GuildCpStats> {
    const result = await prisma.guildMember.aggregate({
      where: { guildId, isActive: true, cp: { not: null } },
      _max: { cp: true },
      _min: { cp: true },
      _avg: { cp: true },
      _sum: { cp: true },
      _count: { cp: true },
    });

    return {
      highest: result._max.cp,
      lowest: result._min.cp,
      average: result._avg.cp === null ? null : Math.round(result._avg.cp),
      total: BigInt(result._sum.cp ?? 0),
      counted: result._count.cp,
    };
  }

  /**
   * Net CP growth for a guild since `since`.
   *
   * Sums the denormalized `delta` column — that's exactly why delta is stored
   * rather than derived: this stays an index-backed SUM instead of a window
   * function over the member's whole history.
   */
  async growthSince(guildId: string, since: Date): Promise<number> {
    const result = await prisma.combatPowerHistory.aggregate({
      where: { guildId, createdAt: { gte: since }, delta: { not: null } },
      _sum: { delta: true },
    });
    return result._sum.delta ?? 0;
  }

  async writeSnapshot(guildId: string, stats: GuildCpStats): Promise<void> {
    await prisma.guildCpSnapshot.create({
      data: {
        guildId,
        highestCp: stats.highest,
        lowestCp: stats.lowest,
        averageCp: stats.average,
        totalCp: stats.total,
        membersCounted: stats.counted,
      },
    });
  }
}

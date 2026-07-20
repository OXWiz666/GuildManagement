import { prisma } from "@guild/db";

/** A live/upcoming spawn row joined with the guild that holds the turn. */
export interface UpcomingSpawn {
  scheduleId: string;
  bossName: string;
  spawnTime: Date;
  location: string;
  status: string;
  /** Guild whose turn it is to take this boss (rotation), if assigned. */
  guildTurn: string | null;
  guildId: string | null;
}

export interface UpcomingActivity {
  id: string;
  type: string;
  title: string;
  location: string | null;
  opponent: string | null;
  scheduledAt: Date;
}

export interface OpenKilledAttendanceWindow {
  sessionId: string;
  scheduleId: string;
  bossName: string;
  location: string;
  killedAt: Date | null;
  expiresAt: Date;
  confirmedCount: number;
  pendingCount: number;
}

export interface BossAttendanceMember {
  userId: string;
  name: string;
  status: "PENDING" | "CONFIRMED";
  joinedAt: Date;
}

export interface BossAttendanceWindowDetail extends OpenKilledAttendanceWindow {
  members: BossAttendanceMember[];
}

/**
 * Boss spawn/kill reads.
 *
 * Writes deliberately do NOT live here — kills go through
 * `markBossRotationKilledByName` in @guild/core, which owns rotation advance,
 * audit logging and the realtime broadcast. Duplicating any of that here would
 * let the bot and website disagree about the same kill.
 */
export class BossRepository {
  /**
   * Upcoming/live spawns visible to a guild.
   *
   * Faction-scoped: a guild in a faction sees the whole faction's board (that's
   * how rotation works — you need to see the boss another guild currently
   * holds). An unaffiliated guild sees only its own rows.
   */
  async listUpcoming(params: {
    guildId: string;
    factionGuildIds: string[];
    bossName?: string;
    limit?: number;
  }): Promise<UpcomingSpawn[]> {
    const { guildId, factionGuildIds, bossName, limit = 60 } = params;

    const scopeIds = factionGuildIds.length > 0 ? factionGuildIds : [guildId];

    const rows = await prisma.bossSchedule.findMany({
      where: {
        // `guildId: null` rows are faction-unified schedules and are visible to
        // every guild in the faction.
        OR: [{ guildId: { in: scopeIds } }, { guildId: null }],
        status: { not: "KILLED" },
        ...(bossName ? { bossName } : {}),
      },
      select: {
        id: true,
        bossName: true,
        spawnTime: true,
        location: true,
        status: true,
        guildId: true,
        guildTurn: true,
        guildTurnGuild: { select: { name: true } },
      },
      orderBy: { spawnTime: "asc" },
      take: limit,
    });

    return rows.map((row) => ({
      scheduleId: row.id,
      bossName: row.bossName,
      spawnTime: row.spawnTime,
      location: row.location,
      status: row.status,
      // guildTurnGuild is the authoritative relation; guildTurn is a legacy
      // denormalized label kept as a fallback for older rows.
      guildTurn: row.guildTurnGuild?.name ?? row.guildTurn,
      guildId: row.guildId,
    }));
  }

  /** Guild ids in the same faction — the visibility scope for spawns. */
  async getFactionGuildIds(guildId: string): Promise<string[]> {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { factionId: true },
    });

    if (!guild?.factionId) return [];

    const guilds = await prisma.guild.findMany({
      where: { factionId: guild.factionId, isActive: true, deletedAt: null },
      select: { id: true },
    });

    return guilds.map((g) => g.id);
  }

  async listUpcomingActivities(guildId: string, limit = 5): Promise<UpcomingActivity[]> {
    const rows = await prisma.guildActivity.findMany({
      where: {
        guildId,
        status: "UPCOMING",
        scheduledAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      select: {
        id: true,
        type: true,
        title: true,
        location: true,
        opponent: true,
        scheduledAt: true,
      },
      orderBy: { scheduledAt: "asc" },
      take: limit,
    });

    return rows;
  }

  /** The live (not-yet-killed) schedule for one boss, if any. */
  async findLiveSchedule(params: {
    bossName: string;
    scopeGuildIds: string[];
  }): Promise<UpcomingSpawn | null> {
    const [row] = await this.listUpcoming({
      guildId: params.scopeGuildIds[0] ?? "",
      factionGuildIds: params.scopeGuildIds,
      bossName: params.bossName,
      limit: 1,
    });
    return row ?? null;
  }

  /**
   * The schedule row backing this boss's currently OPEN check-in window, if
   * any — regardless of whether that row is still "live" or has since been
   * marked KILLED. A kill immediately rolls the boss's schedule forward to a
   * fresh UPCOMING row for its *next* spawn (see syncNextRotationSchedule),
   * so a naive "nearest upcoming" lookup run right after `!kill` resolves to
   * that future placeholder instead of the fight that just happened —
   * re-running `!attendance <boss>` (to add stragglers, or after
   * `!editkilltime` corrects the time) would then open a second,
   * unrelated session and show as a phantom duplicate boss card. Checking
   * the open AttendanceSession first keeps repeat scans attached to the
   * kill they actually belong to.
   */
  async findOpenSessionSchedule(params: { bossName: string; guildId: string }): Promise<UpcomingSpawn | null> {
    const session = await prisma.attendanceSession.findFirst({
      where: {
        guildId: params.guildId,
        isActive: true,
        expiresAt: { gt: new Date() },
        bossSchedule: { bossName: params.bossName, status: "KILLED" },
      },
      select: {
        bossSchedule: {
          select: {
            id: true,
            bossName: true,
            spawnTime: true,
            location: true,
            status: true,
            guildId: true,
            guildTurn: true,
            guildTurnGuild: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const row = session?.bossSchedule;
    if (!row) return null;

    return {
      scheduleId: row.id,
      bossName: row.bossName,
      spawnTime: row.spawnTime,
      location: row.location,
      status: row.status,
      guildTurn: row.guildTurnGuild?.name ?? row.guildTurn,
      guildId: row.guildId,
    };
  }

  async listOpenKilledAttendanceWindows(params: {
    guildId: string;
    bossName?: string;
    limit?: number;
  }): Promise<OpenKilledAttendanceWindow[]> {
    const rows = await prisma.attendanceSession.findMany({
      where: {
        guildId: params.guildId,
        isActive: true,
        expiresAt: { gt: new Date() },
        bossSchedule: {
          status: "KILLED",
          ...(params.bossName ? { bossName: params.bossName } : {}),
        },
      },
      select: {
        id: true,
        expiresAt: true,
        records: {
          select: { status: true },
        },
        bossSchedule: {
          select: {
            id: true,
            bossName: true,
            location: true,
            killedAt: true,
          },
        },
      },
      orderBy: { expiresAt: "asc" },
      take: params.limit ?? 15,
    });

    return rows
      .filter((row) => row.bossSchedule)
      .map((row) => ({
        sessionId: row.id,
        scheduleId: row.bossSchedule!.id,
        bossName: row.bossSchedule!.bossName,
        location: row.bossSchedule!.location,
        killedAt: row.bossSchedule!.killedAt,
        expiresAt: row.expiresAt,
        confirmedCount: row.records.filter((record) => record.status === "CONFIRMED").length,
        pendingCount: row.records.filter((record) => record.status === "PENDING").length,
      }));
  }

  async findOpenKilledAttendanceWindow(params: {
    guildId: string;
    bossName: string;
  }): Promise<BossAttendanceWindowDetail | null> {
    const row = await prisma.attendanceSession.findFirst({
      where: {
        guildId: params.guildId,
        isActive: true,
        expiresAt: { gt: new Date() },
        bossSchedule: {
          status: "KILLED",
          bossName: params.bossName,
        },
      },
      select: {
        id: true,
        expiresAt: true,
        records: {
          select: {
            userId: true,
            status: true,
            joinedAt: true,
            user: {
              select: {
                displayName: true,
                username: true,
                guildMembers: {
                  where: { guildId: params.guildId },
                  select: { ign: true },
                  take: 1,
                },
              },
            },
          },
          orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
        },
        bossSchedule: {
          select: {
            id: true,
            bossName: true,
            location: true,
            killedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!row?.bossSchedule) return null;

    return {
      sessionId: row.id,
      scheduleId: row.bossSchedule.id,
      bossName: row.bossSchedule.bossName,
      location: row.bossSchedule.location,
      killedAt: row.bossSchedule.killedAt,
      expiresAt: row.expiresAt,
      confirmedCount: row.records.filter((record) => record.status === "CONFIRMED").length,
      pendingCount: row.records.filter((record) => record.status === "PENDING").length,
      members: row.records.map((record) => ({
        userId: record.userId,
        name:
          record.user.guildMembers[0]?.ign ??
          record.user.displayName ??
          record.user.username,
        status: record.status,
        joinedAt: record.joinedAt,
      })),
    };
  }

  /**
   * Members who committed to a specific spawn — backs `!party`.
   * BossCommitment is the pre-fight headcount the website already collects.
   */
  async listCommitments(scheduleId: string): Promise<
    Array<{ ign: string | null; displayName: string; role: string; cp: number | null }>
  > {
    const rows = await prisma.bossCommitment.findMany({
      where: { scheduleId },
      select: {
        member: {
          select: {
            ign: true,
            role: true,
            cp: true,
            user: { select: { displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((row) => ({
      ign: row.member.ign,
      displayName: row.member.user.displayName,
      role: row.member.role,
      cp: row.member.cp,
    }));
  }
}

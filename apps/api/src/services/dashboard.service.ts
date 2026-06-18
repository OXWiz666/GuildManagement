import { prisma } from "@guild/db";
import { AttendanceType, AttendanceRecordStatus, BossEventStatus } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { createLedgerEntry } from "./ledger.service";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";
import * as crypto from "crypto";
import { PREDEFINED_BOSSES, getBossImageUrl, getNextBossSpawnTime } from "@guild/shared";
import { broadcastToUser } from "../lib/socket";

// Anti-spam in-memory tracking: userId -> { attempts: number, blockedUntil: Date | null }
interface SpamRecord {
  attempts: number;
  blockedUntil: Date | null;
}
const failedAttemptsMap = new Map<string, SpamRecord>();

const ROTATION_MANAGER_ROLES = ["FACTION_LEADER", "GUILD_LEADER", "ADMIN"];
const BOSS_KILL_AUDIT_ACTIONS = ["BOSS_ROTATION_KILLED", "BOSS_KILLED_LOGGED", "BOSS_KILL_RECORDED"];

type PendingNotification = {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
};

type BossRegistryItem = {
  id: string;
  name: string;
  level: number;
  type: string;
  cooldownHours: number | null;
  location: string;
  fixedSpawns: unknown;
};

function canManageBossRotation(role: string) {
  return ROTATION_MANAGER_ROLES.includes(role);
}

function normalizeQueue(rawQueue: unknown, activeGuildIds: string[]) {
  const queue = Array.isArray(rawQueue)
    ? rawQueue.filter((id): id is string => typeof id === "string")
    : [];
  const activeSet = new Set(activeGuildIds);
  const normalized = queue.filter((id) => activeSet.has(id));
  for (const guildId of activeGuildIds) {
    if (!normalized.includes(guildId)) {
      normalized.push(guildId);
    }
  }
  return normalized;
}

async function requireActiveGuildMember(actorId: string, guildId: string) {
  const membership = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });

  if (!membership || !membership.isActive) {
    throw new ForbiddenError("You must be an active member of this guild");
  }

  return membership;
}

async function requireBossRotationManager(actorId: string, guildId: string) {
  const membership = await requireActiveGuildMember(actorId, guildId);
  if (!canManageBossRotation(membership.role)) {
    throw new ForbiddenError("Only Faction Leaders, Guild Leaders, and Admins can manage boss rotations");
  }
  return membership;
}

async function getActiveFactionGuilds() {
  return prisma.guild.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });
}

function serializeBossScheduleForApi(schedule: any) {
  return {
    id: schedule.id,
    guildId: schedule.guildId,
    bossName: schedule.bossName,
    bossImageUrl: schedule.bossImageUrl,
    spawnTime: schedule.spawnTime.toISOString(),
    location: schedule.location,
    guildTurn: schedule.guildTurn,
    guildTurnGuildId: schedule.guildTurnGuildId,
    guildTurnGuildName: schedule.guildTurnGuild?.name || null,
    status: schedule.status,
    killedAt: schedule.killedAt ? schedule.killedAt.toISOString() : null,
    creatorId: schedule.creatorId,
    createdAt: schedule.createdAt.toISOString(),
    lootDrop: schedule.lootDrop,
    screenshotUrl: schedule.screenshotUrl,
  };
}

function parseBossHistoryMonth(month?: string) {
  const now = new Date();
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth();

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new BadRequestError("Month must use YYYY-MM format");
  }

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return { key, start, end };
}

function getDetailString(detail: Record<string, unknown> | null, key: string) {
  const value = detail?.[key];
  return typeof value === "string" ? value : null;
}

function predefinedBossToRegistryItem(boss: (typeof PREDEFINED_BOSSES)[number]): BossRegistryItem {
  return {
    id: `predefined:${boss.name}`,
    name: boss.name,
    level: boss.level,
    type: boss.type,
    cooldownHours: boss.cooldownHours || null,
    location: boss.location,
    fixedSpawns: boss.fixedSpawns || null,
  };
}

async function getBossRegistryForRotation() {
  try {
    const dbBosses = await prisma.boss.findMany({
      orderBy: [{ type: "asc" }, { level: "desc" }, { name: "asc" }],
    });
    const bossMap = new Map<string, BossRegistryItem>(
      dbBosses.map((boss) => [boss.name.toLowerCase(), boss]),
    );

    for (const boss of PREDEFINED_BOSSES) {
      if (!bossMap.has(boss.name.toLowerCase())) {
        bossMap.set(boss.name.toLowerCase(), predefinedBossToRegistryItem(boss));
      }
    }

    return Array.from(bossMap.values()).sort((a, b) => {
      const typeCompare = a.type.localeCompare(b.type);
      if (typeCompare !== 0) return typeCompare;
      if (b.level !== a.level) return b.level - a.level;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return PREDEFINED_BOSSES
      .map(predefinedBossToRegistryItem)
      .sort((a, b) => {
        const typeCompare = a.type.localeCompare(b.type);
        if (typeCompare !== 0) return typeCompare;
        if (b.level !== a.level) return b.level - a.level;
        return a.name.localeCompare(b.name);
      });
  }
}

async function ensureBossRegistrySeeded() {
  const existingBosses = await prisma.boss.findMany({
    select: { name: true },
  });
  const existingNames = new Set(existingBosses.map((boss) => boss.name.toLowerCase()));
  const missingBosses = PREDEFINED_BOSSES.filter((boss) => !existingNames.has(boss.name.toLowerCase()));

  if (missingBosses.length === 0) {
    return;
  }

  await prisma.$transaction(
    missingBosses.map((boss) =>
      prisma.boss.upsert({
        where: { name: boss.name },
        update: {
          level: boss.level,
          type: boss.type,
          cooldownHours: boss.cooldownHours || null,
          location: boss.location,
          fixedSpawns: boss.fixedSpawns || undefined,
        },
        create: {
          name: boss.name,
          level: boss.level,
          type: boss.type,
          cooldownHours: boss.cooldownHours || null,
          location: boss.location,
          fixedSpawns: boss.fixedSpawns || undefined,
        },
      }),
    ),
  );
}


// ─── Attendance Systems ─────────────────────────

export async function createAttendanceSession(
  guildId: string,
  title: string,
  type: AttendanceType,
  minutes: number,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
  bossScheduleId?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can start attendance sessions");
  }

  // Deactivate any existing active attendance sessions for this guild to keep only one active
  await prisma.attendanceSession.updateMany({
    where: { guildId, isActive: true },
    data: { isActive: false },
  });

  // Generate unique 6-character code
  const randomPin = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 chars like "8F2B9C"
  const code = `ATT-${randomPin.substring(0, 4)}`; // format like "ATT-8F2B"

  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  // Auto-set title for Boss event-specific session if no custom title is provided
  let resolvedTitle = title;
  if (bossScheduleId) {
    const schedule = await prisma.bossSchedule.findUnique({
      where: { id: bossScheduleId },
    });
    if (schedule && (!title || title.trim() === "" || title.trim() === "Guild Attendance" || title.trim() === "Faction Attendance")) {
      resolvedTitle = `${schedule.bossName} Attendance (${new Date(schedule.spawnTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
    }
  }

  const session = await prisma.attendanceSession.create({
    data: {
      guildId,
      code,
      type,
      title: resolvedTitle,
      isActive: true,
      expiresAt,
      bossScheduleId: bossScheduleId || null,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "ATTENDANCE_SESSION_STARTED",
    target: "AttendanceSession",
    targetId: session.id,
    detail: { title: resolvedTitle, code, type, minutes, bossScheduleId },
    ipAddress,
    userAgent,
  });

  return session;
}

export async function submitAttendanceCode(userId: string, code: string) {
  const now = new Date();

  // Enforce Anti-Spam protection
  const spam = failedAttemptsMap.get(userId);
  if (spam && spam.blockedUntil && spam.blockedUntil > now) {
    const minutesLeft = Math.ceil((spam.blockedUntil.getTime() - now.getTime()) / 60000);
    throw new BadRequestError(`Too many incorrect attempts. You are temporarily blocked. Try again in ${minutesLeft} minute(s).`);
  }

  // Search for active, non-expired attendance session
  const cleanCode = code.trim().toUpperCase();
  const session = await prisma.attendanceSession.findFirst({
    where: {
      code: cleanCode,
      isActive: true,
      expiresAt: { gt: now },
    },
    include: {
      guild: true,
    },
  });

  if (!session) {
    // Anti-spam count tracking
    const spamRecord = spam || { attempts: 0, blockedUntil: null };
    spamRecord.attempts += 1;
    if (spamRecord.attempts >= 3) {
      spamRecord.blockedUntil = new Date(now.getTime() + 5 * 60 * 1000); // block for 5 minutes
      failedAttemptsMap.set(userId, spamRecord);
      throw new BadRequestError("Invalid, inactive, or expired attendance code. You have been blocked from checking in for 5 minutes due to too many failed attempts.");
    } else {
      failedAttemptsMap.set(userId, spamRecord);
      const remaining = 3 - spamRecord.attempts;
      throw new BadRequestError(`Invalid, inactive, or expired attendance code. ${remaining} attempt(s) remaining before temporary block.`);
    }
  }

  // Clear anti-spam lock upon successful verification
  failedAttemptsMap.delete(userId);

  // Verify the user is a member of the guild that hosts this session
  const membership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId,
        guildId: session.guildId,
      },
    },
  });

  if (!membership || !membership.isActive) {
    throw new ForbiddenError("You must be an active member of the guild to check in");
  }

  // Check if they already submitted a check-in for this session
  const existingRecord = await prisma.attendanceRecord.findUnique({
    where: {
      userId_sessionId: {
        userId,
        sessionId: session.id,
      },
    },
  });

  if (existingRecord) {
    throw new BadRequestError("You have already checked in for this session");
  }

  // Create record in PENDING status
  const record = await prisma.attendanceRecord.create({
    data: {
      sessionId: session.id,
      userId,
      status: AttendanceRecordStatus.PENDING,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  return {
    success: true,
    sessionTitle: session.title,
    guildName: session.guild.name,
    guildId: session.guildId,
    record,
  };
}

export async function getGuildPendingAttendance(guildId: string, actorId: string) {
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can view pending attendance");
  }

  // Get active session for this guild
  const activeSession = await prisma.attendanceSession.findFirst({
    where: { guildId, isActive: true },
  });

  if (!activeSession) {
    return { activeSession: null, pendingRecords: [] };
  }

  const pendingRecords = await prisma.attendanceRecord.findMany({
    where: {
      sessionId: activeSession.id,
      status: AttendanceRecordStatus.PENDING,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return { activeSession, pendingRecords };
}

export async function confirmAttendanceRecord(
  guildId: string,
  recordId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can confirm check-ins");
  }

  const record = await prisma.attendanceRecord.findUnique({
    where: { id: recordId },
    include: {
      user: { select: { displayName: true } },
      session: true,
    },
  });

  if (!record || record.session.guildId !== guildId) {
    throw new NotFoundError("Attendance record not found in this guild");
  }

  if (record.status === AttendanceRecordStatus.CONFIRMED) {
    throw new BadRequestError("This check-in has already been confirmed");
  }

  // Fetch guild settings for point awards
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
  });

  const attendancePoints = settings?.attendancePoints || 10;
  const currencyCode = settings?.currencyCode || "PHP";

  // Use dynamic atomic transaction to check-in and credit points
  const result = await prisma.$transaction(async (tx) => {
    // 1. Mark as confirmed
    const updatedRecord = await tx.attendanceRecord.update({
      where: { id: recordId },
      data: { status: AttendanceRecordStatus.CONFIRMED },
    });

    // 2. Create Ledger Entry for points credit
    // Currency is standard e.g. "PHP", Amount is raw points value (cents units)
    const ledger = await createLedgerEntry({
      guildId,
      accountType: "MEMBER",
      accountId: record.userId,
      currency: currencyCode,
      amount: BigInt(attendancePoints),
      entryType: "CREDIT",
      referenceType: "ATTENDANCE",
      referenceId: recordId,
      idempotencyKey: `ATT-${recordId}`,
      actorId,
      description: `Checked present in session: ${record.session.title}`,
    });

    return { updatedRecord, ledger };
  });

  // Log in Audit trail
  await writeAuditLog({
    actorId,
    guildId,
    action: "MEMBER_ATTENDANCE_CONFIRMED",
    target: "AttendanceRecord",
    targetId: recordId,
    detail: {
      userId: record.userId,
      displayName: record.user.displayName,
      pointsAwarded: attendancePoints,
      sessionTitle: record.session.title,
    },
    ipAddress,
    userAgent,
  });

  return { success: true, record: result.updatedRecord, points: attendancePoints };
}

// ─── Boss schedules & Calendar systems ───────────

export async function getBossSchedules(guildId: string, requestingUserId?: string) {
  // Retrieve combining both guild-specific events AND unified faction-wide events (guildId: null)
  const schedules = await prisma.bossSchedule.findMany({
    where: {
      OR: [
        { guildId },
        { guildId: null },
      ],
    },
    include: {
      guildTurnGuild: {
        select: { id: true, name: true, slug: true, avatarUrl: true },
      },
      attendanceSessions: {
        include: {
          records: requestingUserId
            ? {
                where: { userId: requestingUserId },
              }
            : true,
        },
      },
    },
    orderBy: { spawnTime: "asc" },
  });

  // Fetch users for creator details
  const creatorIds = Array.from(new Set(schedules.map((s) => s.creatorId)));
  const users = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, displayName: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.displayName]));

  return schedules.map((s) => ({
    id: s.id,
    guildId: s.guildId,
    bossName: s.bossName,
    bossImageUrl: s.bossImageUrl,
    spawnTime: s.spawnTime.toISOString(),
    location: s.location,
    guildTurn: s.guildTurn,
    guildTurnGuildId: s.guildTurnGuildId,
    guildTurnGuildName: s.guildTurnGuild?.name || null,
    status: s.status,
    killedAt: s.killedAt ? s.killedAt.toISOString() : null,
    creatorId: s.creatorId,
    creatorName: userMap.get(s.creatorId) || "System / Officer",
    createdAt: s.createdAt.toISOString(),
    attendanceSessions: s.attendanceSessions.map(session => ({
      id: session.id,
      code: session.code,
      title: session.title,
      type: session.type,
      isActive: session.isActive && new Date(session.expiresAt).getTime() > Date.now(),
      expiresAt: session.expiresAt.toISOString(),
      records: session.records.map(r => ({
        id: r.id,
        userId: r.userId,
        status: r.status,
        joinedAt: r.joinedAt.toISOString()
      }))
    }))
  }));
}

export async function getBossRotation(guildId: string, actorId: string) {
  const membership = await requireActiveGuildMember(actorId, guildId);
  const canManage = canManageBossRotation(membership.role);
  const [guilds, bosses] = await Promise.all([
    getActiveFactionGuilds(),
    getBossRegistryForRotation(),
  ]);

  const activeGuildIds = guilds.map((g) => g.id);
  const guildMap = new Map(guilds.map((g) => [g.id, g]));

  const rotations = [];
  for (const boss of bosses) {
    const existing = await prisma.bossRotation.findUnique({
      where: { bossName: boss.name },
    });
    const queueGuildIds = normalizeQueue(existing?.queueGuildIds, activeGuildIds);
    const currentIndex = queueGuildIds.length
      ? Math.min(existing?.currentIndex || 0, queueGuildIds.length - 1)
      : 0;

    const activeSchedule = await prisma.bossSchedule.findFirst({
      where: {
        bossName: boss.name,
        status: { not: BossEventStatus.KILLED },
      },
      include: { guildTurnGuild: { select: { id: true, name: true, slug: true, avatarUrl: true } } },
      orderBy: { spawnTime: "asc" },
    });

    const latestKilled = await prisma.bossSchedule.findFirst({
      where: {
        bossName: boss.name,
        status: BossEventStatus.KILLED,
      },
      include: { guildTurnGuild: { select: { id: true, name: true, slug: true, avatarUrl: true } } },
      orderBy: { killedAt: "desc" },
    });

    const currentGuildId = queueGuildIds[currentIndex] || null;
    const nextGuildId = queueGuildIds.length
      ? queueGuildIds[(currentIndex + 1) % queueGuildIds.length] || currentGuildId
      : null;
    const currentGuild = currentGuildId ? guildMap.get(currentGuildId) || null : null;
    const nextGuild = nextGuildId ? guildMap.get(nextGuildId) || null : null;
    const spawnTime = boss.type === "FIXED_SCHEDULE"
      ? (activeSchedule?.spawnTime || existing?.nextSpawnTime || getNextBossSpawnTime(boss.name, new Date()))
      : (activeSchedule?.spawnTime ||
         existing?.nextSpawnTime ||
         (latestKilled?.killedAt ? getNextBossSpawnTime(boss.name, latestKilled.killedAt) : new Date()));

    rotations.push({
      id: existing?.id || `predefined:${boss.name}`,
      bossName: boss.name,
      bossImageUrl: getBossImageUrl(boss.name),
      level: boss.level,
      type: boss.type,
      cooldownHours: boss.cooldownHours,
      location: boss.location,
      currentIndex,
      queue: queueGuildIds.map((id) => guildMap.get(id)).filter(Boolean),
      currentGuild,
      nextGuild,
      spawnTime: spawnTime.toISOString(),
      status: activeSchedule
        ? activeSchedule.status
        : latestKilled
          ? BossEventStatus.KILLED
          : BossEventStatus.UPCOMING,
      activeSchedule: activeSchedule ? serializeBossScheduleForApi(activeSchedule) : null,
      latestKilled: latestKilled ? serializeBossScheduleForApi(latestKilled) : null,
    });
  }

  return {
    serverTime: new Date().toISOString(),
    canManage,
    viewerRole: membership.role,
    guilds,
    rotations,
  };
}

export async function updateBossRotationQueue(
  guildId: string,
  bossName: string,
  queueGuildIds: string[],
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireBossRotationManager(actorId, guildId);
  const guilds = await getActiveFactionGuilds();
  const normalizedQueue = normalizeQueue(queueGuildIds, guilds.map((g) => g.id));

  if (normalizedQueue.length === 0) {
    throw new BadRequestError("Rotation queue needs at least one active guild");
  }

  const rotation = await prisma.bossRotation.upsert({
    where: { bossName },
    create: {
      bossName,
      queueGuildIds: normalizedQueue,
      currentIndex: 0,
      updatedById: actorId,
    },
    update: {
      queueGuildIds: normalizedQueue,
      currentIndex: 0,
      updatedById: actorId,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_ROTATION_QUEUE_UPDATED",
    target: "BossRotation",
    targetId: rotation.id,
    detail: { bossName, queueGuildIds: normalizedQueue },
    ipAddress,
    userAgent,
  });

  return getBossRotation(guildId, actorId);
}

export async function markBossRotationKilled(
  guildId: string,
  scheduleId: string,
  killedAt: string,
  takenGuildId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireBossRotationManager(actorId, guildId);
  const killedDate = new Date(killedAt);
  if (Number.isNaN(killedDate.getTime())) {
    throw new BadRequestError("Killed timestamp is invalid");
  }

  const [schedule, guilds] = await Promise.all([
    prisma.bossSchedule.findUnique({
      where: { id: scheduleId },
    }),
    prisma.guild.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, avatarUrl: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!schedule) {
    throw new NotFoundError("Boss schedule not found");
  }
  if (schedule.status === BossEventStatus.KILLED) {
    throw new BadRequestError("This boss kill has already been logged");
  }

  const activeGuildIds = guilds.map((g) => g.id);
  const guildMap = new Map(guilds.map((g) => [g.id, g]));
  const takenGuild = guildMap.get(takenGuildId);

  if (!takenGuild) {
    throw new BadRequestError("Selected taking guild is not active");
  }

  const existingRotation = await prisma.bossRotation.findUnique({
    where: { bossName: schedule.bossName },
  });
  const queueGuildIds = normalizeQueue(existingRotation?.queueGuildIds, activeGuildIds);
  const takenIndex = queueGuildIds.indexOf(takenGuildId);
  const nextIndex = queueGuildIds.length ? ((takenIndex >= 0 ? takenIndex : 0) + 1) % queueGuildIds.length : 0;
  const nextGuildId = queueGuildIds[nextIndex] || null;
  const nextGuild = nextGuildId ? guildMap.get(nextGuildId) || null : null;
  const nextSpawnTime = getNextBossSpawnTime(schedule.bossName, killedDate);

  const updatedEvent = await prisma.bossSchedule.update({
    where: { id: scheduleId },
    data: {
      status: BossEventStatus.KILLED,
      killedAt: killedDate,
      guildTurn: takenGuild.name,
      guildTurnGuildId: takenGuild.id,
    },
  });

  const rotation = await prisma.bossRotation.upsert({
    where: { bossName: schedule.bossName },
    create: {
      bossName: schedule.bossName,
      queueGuildIds,
      currentIndex: nextIndex,
      nextSpawnTime,
      updatedById: actorId,
    },
    update: {
      queueGuildIds,
      currentIndex: nextIndex,
      nextSpawnTime,
      updatedById: actorId,
    },
  });

  const [leaders, auditLog] = await Promise.all([
    nextGuildId
      ? prisma.guildMember.findMany({
          where: {
            guildId: nextGuildId,
            isActive: true,
            role: { in: ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"] },
          },
          select: { userId: true },
        })
      : Promise.resolve([]),
    prisma.auditLog.create({
      data: {
        actorId,
        guildId,
        action: "BOSS_ROTATION_KILLED",
        target: "BossRotation",
        targetId: rotation.id,
        detail: {
          bossName: schedule.bossName,
          killedAt: killedDate.toISOString(),
          takenGuildId: takenGuild.id,
          takenGuildName: takenGuild.name,
          nextSpawnTime: nextSpawnTime.toISOString(),
          nextGuildId,
          nextGuildName: nextGuild?.name || null,
          nextScheduleId: null,
        },
        ipAddress,
        userAgent,
      },
    }),
  ]);

  const notifications: PendingNotification[] = [];
  if (nextGuildId) {
    for (const leader of leaders) {
      notifications.push({
        userId: leader.userId,
        type: "BOSS_ROTATION_NOW",
        title: "It is your Rotation Now",
        body: `${nextGuild?.name || "Your guild"} is now assigned to ${schedule.bossName}.`,
        metadata: {
          bossName: schedule.bossName,
          takenGuildId: takenGuild.id,
          takenGuildName: takenGuild.name,
          guildId: nextGuildId,
          scheduleId: null,
          spawnTime: nextSpawnTime.toISOString(),
        },
      });
    }
  }

  if (notifications.length > 0) {
    await Promise.all(
      notifications.map(async (payload) => {
        try {
          const notification = await prisma.notification.create({
            data: {
              userId: payload.userId,
              type: payload.type,
              title: payload.title,
              body: payload.body,
              metadata: payload.metadata as any,
            },
          });

          void broadcastToUser(notification.userId, "notification_created", {
            id: notification.id,
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            metadata: notification.metadata,
            readAt: null,
            createdAt: notification.createdAt.toISOString(),
          });
        } catch (error) {
          console.error("[Boss Rotation]: Failed to create notification after rotation update", error);
        }
      })
    );
  }

  return {
    schedule: serializeBossScheduleForApi(updatedEvent),
    nextSchedule: null,
    rotationId: rotation.id,
  };
}

export async function markBossRotationKilledByName(
  guildId: string,
  bossName: string,
  killedAt: string,
  takenGuildId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireBossRotationManager(actorId, guildId);
  const killedDate = new Date(killedAt);
  if (Number.isNaN(killedDate.getTime())) {
    throw new BadRequestError("Killed timestamp is invalid");
  }

  // Load registry, active schedule, guilds, and existing rotation in parallel
  const [bosses, activeSchedule, guilds, existingRotation] = await Promise.all([
    getBossRegistryForRotation(),
    prisma.bossSchedule.findFirst({
      where: {
        bossName: bossName.trim(),
        status: { not: BossEventStatus.KILLED },
      },
      orderBy: { spawnTime: "asc" },
    }),
    prisma.guild.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, avatarUrl: true },
      orderBy: { name: "asc" },
    }),
    prisma.bossRotation.findUnique({
      where: { bossName: bossName.trim() },
    }),
  ]);

  const registryBoss = bosses.find((boss) => boss.name.toLowerCase() === bossName.trim().toLowerCase());
  if (!registryBoss) {
    throw new BadRequestError("Boss is not available in the boss registry");
  }

  if (activeSchedule) {
    return markBossRotationKilled(
      guildId,
      activeSchedule.id,
      killedAt,
      takenGuildId,
      actorId,
      ipAddress,
      userAgent,
    );
  }

  const activeGuildIds = guilds.map((g) => g.id);
  const guildMap = new Map(guilds.map((g) => [g.id, g]));
  const takenGuild = guildMap.get(takenGuildId);

  if (!takenGuild) {
    throw new BadRequestError("Selected taking guild is not active");
  }

  const queueGuildIds = normalizeQueue(existingRotation?.queueGuildIds, activeGuildIds);
  const takenIndex = queueGuildIds.indexOf(takenGuildId);
  const nextIndex = queueGuildIds.length ? ((takenIndex >= 0 ? takenIndex : 0) + 1) % queueGuildIds.length : 0;
  const nextGuildId = queueGuildIds[nextIndex] || null;
  const nextGuild = nextGuildId ? guildMap.get(nextGuildId) || null : null;
  const nextSpawnTime = getNextBossSpawnTime(registryBoss.name, killedDate);

  const rotation = await prisma.bossRotation.upsert({
    where: { bossName: registryBoss.name },
    create: {
      bossName: registryBoss.name,
      queueGuildIds,
      currentIndex: nextIndex,
      nextSpawnTime,
      updatedById: actorId,
    },
    update: {
      queueGuildIds,
      currentIndex: nextIndex,
      nextSpawnTime,
      updatedById: actorId,
    },
  });

  const [leaders, auditLog] = await Promise.all([
    nextGuildId
      ? prisma.guildMember.findMany({
          where: {
            guildId: nextGuildId,
            isActive: true,
            role: { in: ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"] },
          },
          select: { userId: true },
        })
      : Promise.resolve([]),
    prisma.auditLog.create({
      data: {
        actorId,
        guildId,
        action: "BOSS_ROTATION_KILLED",
        target: "BossRotation",
        targetId: rotation.id,
        detail: {
          bossName: registryBoss.name,
          killedAt: killedDate.toISOString(),
          takenGuildId: takenGuild.id,
          takenGuildName: takenGuild.name,
          nextSpawnTime: nextSpawnTime.toISOString(),
          nextGuildId,
          nextGuildName: nextGuild?.name || null,
          nextScheduleId: null,
        },
        ipAddress,
        userAgent,
      },
    }),
  ]);

  const notifications: PendingNotification[] = [];
  if (nextGuildId) {
    for (const leader of leaders) {
      notifications.push({
        userId: leader.userId,
        type: "BOSS_ROTATION_NOW",
        title: "It is your Rotation Now",
        body: `${nextGuild?.name || "Your guild"} is now assigned to ${registryBoss.name}.`,
        metadata: {
          bossName: registryBoss.name,
          takenGuildId: takenGuild.id,
          takenGuildName: takenGuild.name,
          guildId: nextGuildId,
          scheduleId: null,
          spawnTime: nextSpawnTime.toISOString(),
        },
      });
    }
  }

  if (notifications.length > 0) {
    await Promise.all(
      notifications.map(async (payload) => {
        try {
          const notification = await prisma.notification.create({
            data: {
              userId: payload.userId,
              type: payload.type,
              title: payload.title,
              body: payload.body,
              metadata: payload.metadata as any,
            },
          });

          void broadcastToUser(notification.userId, "notification_created", {
            id: notification.id,
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            metadata: notification.metadata,
            readAt: null,
            createdAt: notification.createdAt.toISOString(),
          });
        } catch (error) {
          console.error("[Boss Rotation]: Failed to create notification after rotation update", error);
        }
      })
    );
  }

  return {
    schedule: null,
    nextSchedule: null,
    rotationId: rotation.id,
  };
}

export async function getBossKilledHistory(guildId: string, actorId: string, month?: string) {
  await requireActiveGuildMember(actorId, guildId);
  const { key, start, end } = parseBossHistoryMonth(month);

  const logs = await prisma.auditLog.findMany({
    where: {
      guildId,
      action: { in: BOSS_KILL_AUDIT_ACTIONS },
    },
    include: {
      actor: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const days = new Map<string, {
    date: string;
    total: number;
    kills: Array<{
      id: string;
      action: string;
      bossName: string;
      bossImageUrl: string;
      killedAt: string;
      recordedAt: string;
      recordedBy: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
      };
      nextGuildName: string | null;
      nextSpawnTime: string | null;
    }>;
  }>();

  for (const log of logs) {
    const detail = log.detail && typeof log.detail === "object" && !Array.isArray(log.detail)
      ? log.detail as Record<string, unknown>
      : null;
    const killedAtValue = getDetailString(detail, "killedAt") || log.createdAt.toISOString();
    const killedDate = new Date(killedAtValue);

    if (Number.isNaN(killedDate.getTime()) || killedDate < start || killedDate >= end) {
      continue;
    }

    const dayKey = killedDate.toISOString().slice(0, 10);
    const existingDay = days.get(dayKey) || { date: dayKey, total: 0, kills: [] };
    const bossName = getDetailString(detail, "bossName") || log.target || "World Boss";
    existingDay.total += 1;
    existingDay.kills.push({
      id: log.id,
      action: log.action,
      bossName,
      bossImageUrl: getBossImageUrl(bossName),
      killedAt: killedDate.toISOString(),
      recordedAt: log.createdAt.toISOString(),
      recordedBy: {
        id: log.actor.id,
        displayName: log.actor.displayName,
        avatarUrl: log.actor.avatarUrl,
      },
      nextGuildName: getDetailString(detail, "nextGuildName") || getDetailString(detail, "nextGuildTurn"),
      nextSpawnTime: getDetailString(detail, "nextSpawnTime"),
    });
    days.set(dayKey, existingDay);
  }

  const groupedDays = Array.from(days.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((day) => ({
      ...day,
      kills: day.kills.sort((a, b) => new Date(b.killedAt).getTime() - new Date(a.killedAt).getTime()),
    }));

  return {
    month: key,
    total: groupedDays.reduce((sum, day) => sum + day.total, 0),
    days: groupedDays,
  };
}

export async function createBossSchedule(
  guildId: string | null,
  payload: {
    bossName: string;
    bossImageUrl?: string;
    spawnTime: string;
    location: string;
    guildTurn?: string;
    guildTurnGuildId?: string | null;
  },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // If guildId is provided, check actor's role. Faction (null) events require standard verification too.
  // We can let any guild leader/officer of any tenant create faction events, or just check their active guild
  const checkGuildId = guildId || (await prisma.guildMember.findFirst({ where: { userId: actorId, isActive: true } }))?.guildId;

  if (!checkGuildId) {
    throw new ForbiddenError("You must belong to a guild to create schedules");
  }

  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId: checkGuildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can schedule boss events");
  }

  const event = await prisma.bossSchedule.create({
    data: {
      guildId, // Null represents Faction calendar event
      bossName: payload.bossName,
      bossImageUrl: payload.bossImageUrl || null,
      spawnTime: new Date(payload.spawnTime),
      location: payload.location,
      guildTurn: payload.guildTurn || null,
      guildTurnGuildId: payload.guildTurnGuildId || null,
      status: BossEventStatus.UPCOMING,
      creatorId: actorId,
    },
  });

  await writeAuditLog({
    actorId,
    guildId: checkGuildId,
    action: "BOSS_EVENT_SCHEDULED",
    target: "BossSchedule",
    targetId: event.id,
    detail: { bossName: payload.bossName, spawnTime: payload.spawnTime, isFactionWide: !guildId },
    ipAddress,
    userAgent,
  });

  return event;
}

export async function logBossKill(
  guildId: string,
  scheduleId: string,
  killedAt: string,
  actorId: string,
  lootDrop?: string,
  screenshotUrl?: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can log boss kills");
  }

  const schedule = await prisma.bossSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new NotFoundError("Boss schedule not found");
  }

  if (schedule.status === BossEventStatus.KILLED) {
    throw new BadRequestError("This boss kill has already been logged");
  }

  // Faction (null) events or guild-specific events can be logged
  if (schedule.guildId && schedule.guildId !== guildId) {
    throw new ForbiddenError("You cannot edit another guild's schedule");
  }

  const updatedEvent = await prisma.bossSchedule.update({
    where: { id: scheduleId },
    data: {
      status: BossEventStatus.KILLED,
      killedAt: new Date(killedAt),
      lootDrop,
      screenshotUrl,
    },
  });

  // Automatically calculate next spawn for audit logging (scheduling is done manually)
  const killDate = new Date(killedAt);
  const nextSpawnTime = getNextBossSpawnTime(schedule.bossName, killDate);
  const nextSchedule: any = null;

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_KILLED_LOGGED",
    target: "BossSchedule",
    targetId: scheduleId,
    detail: { 
      bossName: schedule.bossName, 
      killedAt, 
      nextSpawnTime: nextSpawnTime.toISOString(),
      nextGuildTurn: nextSchedule ? nextSchedule.guildTurn : undefined,
      lootDrop,
      screenshotUrl
    },
    ipAddress,
    userAgent,
  });

  return { updatedEvent, nextSchedule };
}

export async function updateBossSchedule(
  guildId: string,
  scheduleId: string,
  payload: {
    bossName?: string;
    bossImageUrl?: string;
    spawnTime?: string;
    location?: string;
    guildTurn?: string;
    guildTurnGuildId?: string | null;
    isFaction?: boolean;
  },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can edit schedules");
  }

  const schedule = await prisma.bossSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new NotFoundError("Boss schedule not found");
  }

  // Faction (null) events or guild-specific events can be edited
  if (schedule.guildId && schedule.guildId !== guildId) {
    throw new ForbiddenError("You cannot edit another guild's schedule");
  }

  // Faction Leader check for guildTurn
  const isFactionLeader = actorMembership.role === "FACTION_LEADER" || actorMembership.role === "ADMIN";
  let resolvedGuildTurn = payload.guildTurn;
  if (!isFactionLeader) {
    // If not faction leader, do not allow changing or adding guild turn
    resolvedGuildTurn = schedule.guildTurn || undefined;
  }

  const updatedEvent = await prisma.bossSchedule.update({
    where: { id: scheduleId },
    data: {
      bossName: payload.bossName,
      bossImageUrl: payload.bossImageUrl,
      spawnTime: payload.spawnTime ? new Date(payload.spawnTime) : undefined,
      location: payload.location,
      guildTurn: isFactionLeader ? payload.guildTurn : resolvedGuildTurn,
      guildTurnGuildId: isFactionLeader ? payload.guildTurnGuildId : undefined,
      guildId: payload.isFaction ? null : (payload.isFaction === false ? guildId : undefined),
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_EVENT_UPDATED",
    target: "BossSchedule",
    targetId: scheduleId,
    detail: { ...payload },
    ipAddress,
    userAgent,
  });

  return updatedEvent;
}

export async function deleteBossSchedule(
  guildId: string,
  scheduleId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader or Officer
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can delete schedules");
  }

  const schedule = await prisma.bossSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new NotFoundError("Boss schedule not found");
  }

  if (schedule.guildId && schedule.guildId !== guildId) {
    throw new ForbiddenError("You cannot delete another guild's schedule");
  }

  await prisma.bossSchedule.delete({
    where: { id: scheduleId },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "BOSS_EVENT_DELETED",
    target: "BossSchedule",
    targetId: scheduleId,
    detail: { bossName: schedule.bossName },
    ipAddress,
    userAgent,
  });

  return { success: true };
}

export async function updateAttendanceSession(
  guildId: string,
  sessionId: string,
  payload: {
    title?: string;
    expiresAt?: string;
    isActive?: boolean;
  },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can edit attendance sessions");
  }

  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.guildId !== guildId) {
    throw new NotFoundError("Attendance session not found");
  }

  const updatedSession = await prisma.attendanceSession.update({
    where: { id: sessionId },
    data: {
      title: payload.title,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
      isActive: payload.isActive,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "ATTENDANCE_SESSION_UPDATED",
    target: "AttendanceSession",
    targetId: sessionId,
    detail: { ...payload },
    ipAddress,
    userAgent,
  });

  return updatedSession;
}

export async function deleteAttendanceSession(
  guildId: string,
  sessionId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can delete attendance sessions");
  }

  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.guildId !== guildId) {
    throw new NotFoundError("Attendance session not found");
  }

  await prisma.attendanceSession.delete({
    where: { id: sessionId },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "ATTENDANCE_SESSION_DELETED",
    target: "AttendanceSession",
    targetId: sessionId,
    detail: { title: session.title },
    ipAddress,
    userAgent,
  });

  return { success: true };
}

export async function getBosses() {
  await ensureBossRegistrySeeded();
  return prisma.boss.findMany({
    orderBy: { level: "asc" },
  });
}

export async function getMemberAttendanceStats(guildId: string, userId: string) {
  const sessions = await prisma.attendanceSession.findMany({
    where: { guildId },
    include: {
      records: {
        where: { userId }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  // Streaks (expired sessions chronologically consecutive confirmed)
  let currentStreak = 0;
  for (const session of sessions) {
    const isExpired = new Date(session.expiresAt).getTime() < Date.now();
    if (!isExpired) {
      const userRecord = session.records[0];
      if (userRecord && userRecord.status === AttendanceRecordStatus.CONFIRMED) {
        currentStreak++;
      }
      continue;
    }
    const userRecord = session.records[0];
    if (userRecord && userRecord.status === AttendanceRecordStatus.CONFIRMED) {
      currentStreak++;
    } else {
      break; // Streak broken
    }
  }

  // Attendance metrics
  const totalSessions = sessions.filter(s => new Date(s.expiresAt).getTime() < Date.now()).length;
  const confirmedSessions = sessions.filter(s => s.records[0]?.status === AttendanceRecordStatus.CONFIRMED).length;
  const presenceRate = totalSessions > 0 ? Math.round((confirmedSessions / totalSessions) * 100) : 100;
  const participationCount = confirmedSessions;

  // Contribution points from ledger
  const ledgerSum = await prisma.ledgerEntry.aggregate({
    where: {
      guildId,
      accountId: userId,
      accountType: "MEMBER",
      referenceType: "ATTENDANCE"
    },
    _sum: {
      amount: true
    }
  });
  const totalPoints = Number(ledgerSum._sum.amount || 0);

  // Missed attendance alerts (expired in the last 7 days where the user had no confirmed record)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const missedSessions = sessions.filter(s => {
    const isExpired = new Date(s.expiresAt).getTime() < Date.now();
    const isRecent = new Date(s.createdAt).getTime() > sevenDaysAgo.getTime();
    const hasConfirmedRecord = s.records[0]?.status === AttendanceRecordStatus.CONFIRMED;
    return isExpired && isRecent && !hasConfirmedRecord;
  });

  const missedAlerts = missedSessions.map(s => ({
    sessionId: s.id,
    title: s.title,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString()
  }));

  const history = sessions.map(session => {
    const record = session.records[0];
    let status: "CONFIRMED" | "PENDING" | "MISSED" | "UNCHECKED" = "UNCHECKED";
    
    if (record) {
      if (record.status === AttendanceRecordStatus.CONFIRMED) {
        status = "CONFIRMED";
      } else {
        status = "PENDING";
      }
    } else {
      const isExpired = new Date(session.expiresAt).getTime() < Date.now();
      if (isExpired) {
        status = "MISSED";
      } else {
        status = "UNCHECKED";
      }
    }
    
    return {
      sessionId: session.id,
      title: session.title,
      type: session.type,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      status,
      joinedAt: record ? record.joinedAt.toISOString() : null,
    };
  });

  return {
    presenceRate,
    currentStreak,
    participationCount,
    totalPoints,
    missedAlerts,
    history
  };
}

export async function getDashboardSummary(guildId: string, userId: string) {
  // Verify membership
  const membership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId,
        guildId,
      },
    },
  });

  if (!membership || !membership.isActive) {
    throw new ForbiddenError("You must be an active member of this guild to view dashboard stats");
  }

  // 1. Get guild settings for currency symbol & code
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
  });

  const currencySymbol = settings?.currencySymbol || "₱";
  const currencyCode = settings?.currencyCode || "PHP";

  // 2. Fetch all other metrics in parallel to prevent database query blocking/latency
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  const sevenDaysAgoTime = new Date();
  sevenDaysAgoTime.setDate(sevenDaysAgoTime.getDate() - 6);
  sevenDaysAgoTime.setHours(0, 0, 0, 0);

  const [
    ledgerEntries,
    weeklyCreditSum,
    pointsSum,
    weeklyPointsSum,
    totalMembers,
    onlineMembersCount,
    bossKillsToday,
    totalBossKills,
    memberLedger,
    guildAudit,
    creditsHistory,
    claims,
  ] = await Promise.all([
    // 1. Fetch Balance sum
    prisma.ledgerEntry.groupBy({
      by: ["entryType"],
      where: {
        accountType: "MEMBER",
        accountId: userId,
        currency: currencyCode,
        guildId,
      },
      _sum: { amount: true },
    }),
    // 2. Fetch Balance change this week (last 7 days)
    prisma.ledgerEntry.aggregate({
      where: {
        accountType: "MEMBER",
        accountId: userId,
        currency: currencyCode,
        guildId,
        entryType: "CREDIT",
        createdAt: { gte: sevenDaysAgo },
      },
      _sum: { amount: true },
    }),
    // 3. Guild Points
    prisma.ledgerEntry.aggregate({
      where: {
        guildId,
        accountId: userId,
        accountType: "MEMBER",
        referenceType: "ATTENDANCE",
      },
      _sum: { amount: true },
    }),
    // 4. Weekly Guild Points
    prisma.ledgerEntry.aggregate({
      where: {
        guildId,
        accountId: userId,
        accountType: "MEMBER",
        referenceType: "ATTENDANCE",
        createdAt: { gte: sevenDaysAgo },
      },
      _sum: { amount: true },
    }),
    // 5. Total Members count
    prisma.guildMember.count({
      where: { guildId, isActive: true },
    }),
    // 6. Online Members count
    prisma.guildMember.count({
      where: {
        guildId,
        isActive: true,
        user: {
          sessions: {
            some: {
              lastActive: { gte: fifteenMinutesAgo },
            },
          },
        },
      },
    }),
    // 7. Boss Kills Today count
    prisma.bossSchedule.count({
      where: {
        OR: [
          { guildId },
          { guildId: null },
        ],
        status: BossEventStatus.KILLED,
        killedAt: { gte: startOfToday },
      },
    }),
    // 8. Total Boss Kills count
    prisma.bossSchedule.count({
      where: {
        OR: [
          { guildId },
          { guildId: null },
        ],
        status: BossEventStatus.KILLED,
      },
    }),
    // 9. Member Ledger timeline
    prisma.ledgerEntry.findMany({
      where: {
        guildId,
        accountId: userId,
        accountType: "MEMBER",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // 10. Guild Audit timeline
    prisma.auditLog.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // 11. Performance credits history
    prisma.ledgerEntry.findMany({
      where: {
        guildId,
        accountId: userId,
        accountType: "MEMBER",
        entryType: "CREDIT",
        createdAt: {
          gte: sevenDaysAgoTime,
        },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    }),
    // 12. Claims ratio by guild turn
    prisma.bossSchedule.groupBy({
      by: ["guildTurn"],
      where: {
        status: BossEventStatus.KILLED,
        guildTurn: { not: null },
      },
      _count: {
        id: true,
      },
    }),
  ]);

  let credits = 0n;
  let debits = 0n;
  for (const row of ledgerEntries) {
    if (row.entryType === "CREDIT") {
      credits = row._sum.amount ?? 0n;
    } else {
      debits = row._sum.amount ?? 0n;
    }
  }
  const balanceCents = credits - debits;
  const balanceValue = `${currencySymbol} ${(Number(balanceCents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const weeklyCredit = Number(weeklyCreditSum._sum.amount || 0n) / 100;
  const balanceSub = `+${currencySymbol}${weeklyCredit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} this week`;

  const totalPoints = Number(pointsSum._sum.amount || 0n);
  const guildPointsValue = totalPoints.toLocaleString();

  const weeklyPoints = Number(weeklyPointsSum._sum.amount || 0n);
  const guildPointsSub = `+${weeklyPoints.toLocaleString()} this week`;

  const membersValue = totalMembers.toString();
  const membersSub = `${onlineMembersCount} online`;

  const bossTodayValue = bossKillsToday.toString();
  const bossTodaySub = `${totalBossKills} this season`;

  const activities: Array<{
    type: "CREDIT" | "DEBIT" | "POINTS" | "INFO" | "CONFIG";
    action: string;
    detail: string;
    createdAt: Date;
  }> = [];

  for (const entry of memberLedger) {
    if (entry.referenceType === "ATTENDANCE") {
      activities.push({
        type: "POINTS",
        action: "Attendance Check-In",
        detail: `Earned +${entry.amount.toString()} points for attendance`,
        createdAt: entry.createdAt,
      });
    } else if (entry.entryType === "CREDIT") {
      const amountFormatted = `${currencySymbol}${(Number(entry.amount) / 100).toFixed(2)}`;
      activities.push({
        type: "CREDIT",
        action: entry.referenceType === "BOSS_KILL" ? "Boss Kill Payout" : "Ledger Credit",
        detail: entry.description || `Received ${amountFormatted} credit payout`,
        createdAt: entry.createdAt,
      });
    } else {
      const amountFormatted = `${currencySymbol}${(Number(entry.amount) / 100).toFixed(2)}`;
      activities.push({
        type: "DEBIT",
        action: entry.referenceType === "PAYOUT" ? "Cash Out" : "Ledger Debit",
        detail: entry.description || `Withdrew ${amountFormatted} from ledger`,
        createdAt: entry.createdAt,
      });
    }
  }

  for (const log of guildAudit) {
    if (log.action === "MEMBER_ADDED" || log.action === "GUILD_JOIN_REQUEST_ACCEPTED") {
      const addedMemberName = (log.detail as any)?.displayName || "New member";
      activities.push({
        type: "INFO",
        action: "Member Joined",
        detail: `${addedMemberName} joined the guild`,
        createdAt: log.createdAt,
      });
    } else if (log.action.includes("SETTINGS") || log.action.includes("CONFIG")) {
      activities.push({
        type: "CONFIG",
        action: "Settings Updated",
        detail: "Guild configuration was modified",
        createdAt: log.createdAt,
      });
    } else if (log.action === "BOSS_KILLED_LOGGED" || log.action === "BOSS_KILL_RECORDED") {
      const bossName = (log.detail as any)?.bossName || "World Boss";
      activities.push({
        type: "CREDIT",
        action: "Boss Defeated",
        detail: `${bossName} was successfully recorded killed`,
        createdAt: log.createdAt,
      });
    }
  }

  activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const formattedActivities = activities.slice(0, 5).map((act) => {
    const diffMs = Date.now() - act.createdAt.getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (3600 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 3600 * 1000));

    let timeStr = "Just now";
    if (diffMins > 0 && diffMins < 60) {
      timeStr = `${diffMins}m ago`;
    } else if (diffHours > 0 && diffHours < 24) {
      timeStr = `${diffHours}h ago`;
    } else if (diffDays === 1) {
      timeStr = "Yesterday";
    } else if (diffDays > 1) {
      timeStr = `${diffDays}d ago`;
    }

    return {
      type: act.type,
      action: act.action,
      detail: act.detail,
      time: timeStr,
    };
  });

  if (formattedActivities.length === 0) {
    formattedActivities.push({
      type: "INFO",
      action: "Welcome",
      detail: "Welcome to your guild dashboard!",
      time: "Just now",
    });
  }

  // 7. Performance history (Ledger credit accumulations over the last 7 calendar days)
  const performanceHistory: Array<{ dayName: string; amount: number }> = [];
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const dailyAmounts: { [key: string]: number } = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toDateString();
    dailyAmounts[dateStr] = 0;
  }

  for (const entry of creditsHistory) {
    const dateStr = entry.createdAt.toDateString();
    if (dailyAmounts[dateStr] !== undefined) {
      dailyAmounts[dateStr] += Number(entry.amount) / 100;
    }
  }

  const generatedPerformanceHistory = Object.keys(dailyAmounts).map((dateStr) => {
    const d = new Date(dateStr);
    return {
      dayName: daysOfWeek[d.getDay()],
      amount: dailyAmounts[dateStr],
    };
  });

  // 8. Faction claim ratios (Group boss schedules by guild turn)

  const totalClaimsCount = claims.reduce((acc, c) => acc + c._count.id, 0);
  const factionClaims = claims
    .map((c) => {
      const claimsCount = c._count.id;
      const percentage = totalClaimsCount > 0 ? Math.round((claimsCount / totalClaimsCount) * 100) : 0;
      return {
        guildName: c.guildTurn || "Unknown",
        claimsCount,
        percentage,
      };
    })
    .sort((a, b) => b.claimsCount - a.claimsCount);

  return {
    balance: {
      raw: Number(balanceCents) / 100,
      value: balanceValue,
      sub: balanceSub,
      currencySymbol,
    },
    guildPoints: {
      raw: totalPoints,
      value: guildPointsValue,
      sub: guildPointsSub,
    },
    members: {
      raw: totalMembers,
      value: membersValue,
      sub: membersSub,
      online: onlineMembersCount,
    },
    bossToday: {
      raw: bossKillsToday,
      value: bossTodayValue,
      sub: bossTodaySub,
      total: totalBossKills,
    },
    recentActivity: formattedActivities,
    performanceHistory: generatedPerformanceHistory,
    factionClaims: factionClaims,
  };
}

export async function getAccountingDashboard(guildId: string, actorId: string, page: number = 1, limit: number = 25) {
  // Validate actor is Guild Leader, Officer, or Faction Leader
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive) {
    throw new ForbiddenError("You must be an active member of this guild to view accounting");
  }

  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
  });

  const currencySymbol = settings?.currencySymbol || "₱";
  const currencyCode = settings?.currencyCode || "PHP";
  const secondarySymbol = settings?.secondaryCurrencySymbol || "💎";
  const secondaryCode = settings?.secondaryCurrencyCode || "DIAMOND";

  // 1. Fetch treasury balances
  // A. Guild Treasury Balance
  const fundCreditsSum = await prisma.ledgerEntry.aggregate({
    where: { guildId, accountType: "GUILD_FUND", entryType: "CREDIT", currency: currencyCode },
    _sum: { amount: true },
  });
  const fundDebitsSum = await prisma.ledgerEntry.aggregate({
    where: { guildId, accountType: "GUILD_FUND", entryType: "DEBIT", currency: currencyCode },
    _sum: { amount: true },
  });
  const fundBalanceCents = (fundCreditsSum._sum.amount || 0n) - (fundDebitsSum._sum.amount || 0n);

  // B. Guild Tax Balance
  const taxCreditsSum = await prisma.ledgerEntry.aggregate({
    where: { guildId, accountType: "TAX", entryType: "CREDIT", currency: currencyCode },
    _sum: { amount: true },
  });
  const taxDebitsSum = await prisma.ledgerEntry.aggregate({
    where: { guildId, accountType: "TAX", entryType: "DEBIT", currency: currencyCode },
    _sum: { amount: true },
  });
  const taxBalanceCents = (taxCreditsSum._sum.amount || 0n) - (taxDebitsSum._sum.amount || 0n);

  // C. Total Expenses
  const expensesSum = await prisma.ledgerEntry.aggregate({
    where: {
      guildId,
      entryType: "DEBIT",
      currency: currencyCode,
      accountType: { in: ["GUILD_FUND", "TAX"] },
    },
    _sum: { amount: true },
  });
  const totalExpensesCents = expensesSum._sum.amount || 0n;

  // Secondary Currency Treasury
  const secFundCreditsSum = await prisma.ledgerEntry.aggregate({
    where: { guildId, accountType: "GUILD_FUND", entryType: "CREDIT", currency: secondaryCode },
    _sum: { amount: true },
  });
  const secFundDebitsSum = await prisma.ledgerEntry.aggregate({
    where: { guildId, accountType: "GUILD_FUND", entryType: "DEBIT", currency: secondaryCode },
    _sum: { amount: true },
  });
  const secFundBalanceCents = (secFundCreditsSum._sum.amount || 0n) - (secFundDebitsSum._sum.amount || 0n);

  const secTaxCreditsSum = await prisma.ledgerEntry.aggregate({
    where: { guildId, accountType: "TAX", entryType: "CREDIT", currency: secondaryCode },
    _sum: { amount: true },
  });
  const secTaxDebitsSum = await prisma.ledgerEntry.aggregate({
    where: { guildId, accountType: "TAX", entryType: "DEBIT", currency: secondaryCode },
    _sum: { amount: true },
  });
  const secTaxBalanceCents = (secTaxCreditsSum._sum.amount || 0n) - (secTaxDebitsSum._sum.amount || 0n);

  const secExpensesSum = await prisma.ledgerEntry.aggregate({
    where: {
      guildId,
      entryType: "DEBIT",
      currency: secondaryCode,
      accountType: { in: ["GUILD_FUND", "TAX"] },
    },
    _sum: { amount: true },
  });
  const secExpensesCents = secExpensesSum._sum.amount || 0n;

  // 2. Member Balance Board - OPTIMIZED O(1) BATCH QUERIES
  const members = await prisma.guildMember.findMany({
    where: { guildId, isActive: true },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });

  // A. Fetch DKP points for all guild members in a single query
  const dkpAggregates = await prisma.ledgerEntry.groupBy({
    by: ["accountId"],
    where: {
      guildId,
      accountType: "MEMBER",
      referenceType: "ATTENDANCE",
    },
    _sum: { amount: true },
  });

  const memberDkpMap: Record<string, number> = {};
  for (const row of dkpAggregates) {
    memberDkpMap[row.accountId] = Number(row._sum.amount || 0n);
  }

  // B. Fetch credits and debits for ALL members and ALL currencies in a single query
  const balanceAggregates = await prisma.ledgerEntry.groupBy({
    by: ["accountId", "entryType", "currency"],
    where: {
      guildId,
      accountType: "MEMBER",
    },
    _sum: { amount: true },
  });

  // memberBalancesMap[userId][currencyCode][entryType] = amount
  const memberBalancesMap: Record<string, Record<string, { CREDIT: bigint; DEBIT: bigint }>> = {};

  for (const row of balanceAggregates) {
    const userId = row.accountId;
    const currency = row.currency;
    const entryType = row.entryType as "CREDIT" | "DEBIT";
    const amount = row._sum.amount || 0n;

    if (!memberBalancesMap[userId]) {
      memberBalancesMap[userId] = {};
    }
    if (!memberBalancesMap[userId][currency]) {
      memberBalancesMap[userId][currency] = { CREDIT: 0n, DEBIT: 0n };
    }
    memberBalancesMap[userId][currency][entryType] = amount;
  }

  const memberBalances = members.map((m) => {
    const userId = m.userId;
    const dkp = memberDkpMap[userId] || 0;

    // Primary Currency Balance
    const prim = memberBalancesMap[userId]?.[currencyCode] || { CREDIT: 0n, DEBIT: 0n };
    const balance = Number(prim.CREDIT - prim.DEBIT) / 100;
    const totalEarned = Number(prim.CREDIT) / 100;

    // Secondary Currency Balance
    const sec = memberBalancesMap[userId]?.[secondaryCode] || { CREDIT: 0n, DEBIT: 0n };
    const secBalance = Number(sec.CREDIT - sec.DEBIT) / 100;
    const secTotalEarned = Number(sec.CREDIT) / 100;

    return {
      memberId: m.id,
      userId: m.userId,
      ign: m.ign || m.user.displayName,
      role: m.role,
      rankName: m.rankName,
      cp: m.cp || 0,
      class: m.class || "Unknown",
      dkp,
      balance,
      totalEarned,
      secBalance,
      secTotalEarned,
      user: m.user,
    };
  });

  // 3. Paginated Transaction Ledger history
  const totalTransactions = await prisma.ledgerEntry.count({
    where: { guildId },
  });

  const skip = (page - 1) * limit;
  const take = limit;

  const ledgerHistory = await prisma.ledgerEntry.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });

  const formattedHistory = ledgerHistory.map((item) => ({
    id: item.id,
    accountType: item.accountType,
    accountId: item.accountId,
    currency: item.currency,
    amount: Number(item.amount) / 100,
    entryType: item.entryType,
    referenceType: item.referenceType,
    referenceId: item.referenceId,
    description: item.description,
    createdAt: item.createdAt.toISOString(),
  }));

  return {
    treasury: {
      primary: {
        currencyCode,
        currencySymbol,
        fundBalance: Number(fundBalanceCents) / 100,
        taxBalance: Number(taxBalanceCents) / 100,
        totalExpenses: Number(totalExpensesCents) / 100,
      },
      secondary: {
        currencyCode: secondaryCode,
        currencySymbol: secondarySymbol,
        fundBalance: Number(secFundBalanceCents) / 100,
        taxBalance: Number(secTaxBalanceCents) / 100,
        totalExpenses: Number(secExpensesCents) / 100,
      },
    },
    memberBalances,
    transactions: formattedHistory,
    pagination: {
      page,
      limit,
      total: totalTransactions,
      totalPages: Math.ceil(totalTransactions / limit),
    },
  };
}

export async function createTreasuryAdjustment(
  guildId: string,
  payload: {
    accountId: string; // userId or guildId
    accountType: "MEMBER" | "GUILD_FUND" | "TAX";
    entryType: "CREDIT" | "DEBIT";
    amount: number; // in floating decimal standard format (e.g. 150.50)
    currency: string;
    description: string;
  },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  // Validate actor is Guild Leader, Officer, or Faction Leader
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "FACTION_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can make treasury adjustments");
  }

  const centsAmount = BigInt(Math.round(payload.amount * 100));
  const idKey = `ADJ-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

  const entry = await createLedgerEntry({
    guildId,
    accountType: payload.accountType,
    accountId: payload.accountId,
    currency: payload.currency,
    amount: centsAmount,
    entryType: payload.entryType,
    referenceType: "MANUAL_ADJUSTMENT",
    referenceId: idKey,
    idempotencyKey: idKey,
    actorId,
    description: payload.description,
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "TREASURY_ADJUSTMENT",
    target: "LedgerEntry",
    targetId: entry.id,
    detail: {
      accountId: payload.accountId,
      accountType: payload.accountType,
      entryType: payload.entryType,
      amount: payload.amount.toString(),
      currency: payload.currency,
      description: payload.description,
    },
    ipAddress,
    userAgent,
  });

  return entry;
}

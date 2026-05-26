import { prisma } from "@guild/db";
import { AttendanceType, AttendanceRecordStatus, BossEventStatus } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { createLedgerEntry } from "./ledger.service";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";
import * as crypto from "crypto";
import { getNextBossSpawnTime } from "@guild/shared";

// Anti-spam in-memory tracking: userId -> { attempts: number, blockedUntil: Date | null }
interface SpamRecord {
  attempts: number;
  blockedUntil: Date | null;
}
const failedAttemptsMap = new Map<string, SpamRecord>();


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

export async function getBossSchedules(guildId: string) {
  // Retrieve combining both guild-specific events AND unified faction-wide events (guildId: null)
  const schedules = await prisma.bossSchedule.findMany({
    where: {
      OR: [
        { guildId },
        { guildId: null },
      ],
    },
    include: {
      attendanceSessions: {
        include: {
          records: true
        }
      }
    },
    orderBy: { spawnTime: "asc" },
  });

  return schedules.map((s) => ({
    id: s.id,
    guildId: s.guildId,
    bossName: s.bossName,
    bossImageUrl: s.bossImageUrl,
    spawnTime: s.spawnTime.toISOString(),
    location: s.location,
    guildTurn: s.guildTurn,
    status: s.status,
    killedAt: s.killedAt ? s.killedAt.toISOString() : null,
    creatorId: s.creatorId,
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

export async function createBossSchedule(
  guildId: string | null,
  payload: {
    bossName: string;
    bossImageUrl?: string;
    spawnTime: string;
    location: string;
    guildTurn?: string;
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

  // Automatically calculate next spawn and schedule it in the calendar
  const killDate = new Date(killedAt);
  const nextSpawnTime = getNextBossSpawnTime(schedule.bossName, killDate);

  await prisma.bossSchedule.create({
    data: {
      guildId: schedule.guildId, // Maintains the same guild or faction unified scope
      bossName: schedule.bossName,
      bossImageUrl: schedule.bossImageUrl,
      location: schedule.location,
      guildTurn: schedule.guildTurn,
      status: BossEventStatus.UPCOMING,
      spawnTime: nextSpawnTime,
      creatorId: actorId,
    },
  });

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
      lootDrop,
      screenshotUrl
    },
    ipAddress,
    userAgent,
  });

  return updatedEvent;
}

export async function getBosses() {
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

  return {
    presenceRate,
    currentStreak,
    participationCount,
    totalPoints,
    missedAlerts
  };
}

<<<<<<< HEAD
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

  // 2. Fetch Balance and Balance change this week (last 7 days)
  const ledgerEntries = await prisma.ledgerEntry.groupBy({
    by: ["entryType"],
    where: {
      accountType: "MEMBER",
      accountId: userId,
      currency: currencyCode,
      guildId,
    },
    _sum: { amount: true },
  });

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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklyCreditSum = await prisma.ledgerEntry.aggregate({
    where: {
      accountType: "MEMBER",
      accountId: userId,
      currency: currencyCode,
      guildId,
      entryType: "CREDIT",
      createdAt: { gte: sevenDaysAgo },
    },
    _sum: { amount: true },
  });
  const weeklyCredit = Number(weeklyCreditSum._sum.amount || 0n) / 100;
  const balanceSub = `+${currencySymbol}${weeklyCredit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} this week`;

  // 3. Guild Points
  const pointsSum = await prisma.ledgerEntry.aggregate({
    where: {
      guildId,
      accountId: userId,
      accountType: "MEMBER",
      referenceType: "ATTENDANCE",
    },
    _sum: { amount: true },
  });
  const totalPoints = Number(pointsSum._sum.amount || 0n);
  const guildPointsValue = totalPoints.toLocaleString();

  const weeklyPointsSum = await prisma.ledgerEntry.aggregate({
    where: {
      guildId,
      accountId: userId,
      accountType: "MEMBER",
      referenceType: "ATTENDANCE",
      createdAt: { gte: sevenDaysAgo },
    },
    _sum: { amount: true },
  });
  const weeklyPoints = Number(weeklyPointsSum._sum.amount || 0n);
  const guildPointsSub = `+${weeklyPoints.toLocaleString()} this week`;

  // 4. Members
  const totalMembers = await prisma.guildMember.count({
    where: { guildId, isActive: true },
  });

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const onlineMembersCount = await prisma.guildMember.count({
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
  });
  const membersValue = totalMembers.toString();
  const membersSub = `${onlineMembersCount} online`;

  // 5. Boss Today
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const bossKillsToday = await prisma.bossSchedule.count({
    where: {
      OR: [
        { guildId },
        { guildId: null },
      ],
      status: BossEventStatus.KILLED,
      killedAt: { gte: startOfToday },
    },
  });

  const totalBossKills = await prisma.bossSchedule.count({
    where: {
      OR: [
        { guildId },
        { guildId: null },
      ],
      status: BossEventStatus.KILLED,
    },
  });
  const bossTodayValue = bossKillsToday.toString();
  const bossTodaySub = `${totalBossKills} this season`;

  // 6. Recent Activity Timeline
  const memberLedger = await prisma.ledgerEntry.findMany({
    where: {
      guildId,
      accountId: userId,
      accountType: "MEMBER",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const guildAudit = await prisma.auditLog.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

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
  };
}


=======
>>>>>>> 4ca53ae77e7e08144101dc0e85266ff4e8db7288

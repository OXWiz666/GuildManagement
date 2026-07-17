import { prisma } from "@guild/db";
import { getGuildMemberByUser } from "./guild.service";
import { writeAuditLog } from "./audit.service";
import { getEffectiveActivityPointRules } from "./activityPoints.service";
import { NotFoundError, BadRequestError, ForbiddenError } from "../utils/errors";

// ─── Guild Activities (Guild Boss / Guild War / PK War / custom) ─────────
// A unified, simple scheduler for guild events with optional opponent, result,
// and member attendance (check-in → officer confirmation). The set of valid
// `type` values is not a fixed enum — it's whatever activities the guild has
// registered in Register Activity (Guild Settings → Activities Multiplier),
// so leaders can add custom activity types without a code change.

const ACTIVITY_STATUSES = ["UPCOMING", "COMPLETED", "CANCELLED"] as const;
const ACTIVITY_RESULTS = ["WIN", "LOSS", "DRAW"] as const;
const OFFICER_ROLES = ["OFFICER", "GUILD_LEADER", "FACTION_LEADER", "ADMIN"];

const REPEAT_INTERVALS = ["WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
type RepeatInterval = (typeof REPEAT_INTERVALS)[number];

const REPEAT_INTERVAL_DAYS: Record<RepeatInterval, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
};

function validRepeatInterval(value: unknown): RepeatInterval | null {
  if (value === undefined || value === null || value === "") return null;
  if (!REPEAT_INTERVALS.includes(value as RepeatInterval)) throw new BadRequestError("Invalid repeat interval");
  return value as RepeatInterval;
}

async function validateActivityType(guildId: string, type: unknown): Promise<string> {
  if (typeof type !== "string" || !type.trim()) throw new BadRequestError("Activity type is required");
  const rules = await getEffectiveActivityPointRules(guildId);
  if (!rules.activities.some((a) => a.key === type)) throw new BadRequestError("Invalid activity type");
  return type;
}

async function requireActiveMember(actorId: string, guildId: string) {
  const membership = await getGuildMemberByUser(actorId, guildId);
  if (!membership || !membership.isActive) {
    throw new ForbiddenError("You must be an active member of this guild");
  }
  return membership;
}

async function requireOfficer(actorId: string, guildId: string) {
  const membership = await requireActiveMember(actorId, guildId);
  if (!OFFICER_ROLES.includes(membership.role)) {
    throw new ForbiddenError("Only officers and leaders can manage guild activities");
  }
  return membership;
}

function validText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestError(`${field} is required`);
  if (value.length > max) throw new BadRequestError(`${field} is too long`);
  return value.trim();
}

function optText(value: unknown, max = 500): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function serializeActivity(
  activity: {
    id: string;
    type: string;
    title: string;
    location: string | null;
    opponent: string | null;
    notes: string | null;
    scheduledAt: Date;
    status: string;
    result: string | null;
    scoreFor: number | null;
    scoreAgainst: number | null;
    repeatInterval: string | null;
    creatorId: string;
    createdAt: Date;
    attendees: Array<{ userId: string; status: string }>;
  },
  userMap: Map<string, { displayName: string; avatarUrl: string | null }>,
  viewerId: string,
) {
  const attendees = activity.attendees.map((a) => ({
    userId: a.userId,
    displayName: userMap.get(a.userId)?.displayName ?? "Unknown",
    avatarUrl: userMap.get(a.userId)?.avatarUrl ?? null,
    status: a.status,
  }));
  const mine = activity.attendees.find((a) => a.userId === viewerId);
  return {
    id: activity.id,
    type: activity.type,
    title: activity.title,
    location: activity.location,
    opponent: activity.opponent,
    notes: activity.notes,
    scheduledAt: activity.scheduledAt.toISOString(),
    status: activity.status,
    result: activity.result,
    scoreFor: activity.scoreFor,
    scoreAgainst: activity.scoreAgainst,
    repeatInterval: activity.repeatInterval,
    creatorId: activity.creatorId,
    creatorName: userMap.get(activity.creatorId)?.displayName ?? "Unknown",
    createdAt: activity.createdAt.toISOString(),
    attendeeCount: attendees.length,
    confirmedCount: attendees.filter((a) => a.status === "CONFIRMED").length,
    myStatus: mine ? mine.status : "NONE",
    attendees,
  };
}

async function hydrateUsers(userIds: string[]) {
  const uniq = Array.from(new Set(userIds));
  if (uniq.length === 0) return new Map<string, { displayName: string; avatarUrl: string | null }>();
  const users = await prisma.user.findMany({
    where: { id: { in: uniq } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  return new Map(users.map((u) => [u.id, { displayName: u.displayName, avatarUrl: u.avatarUrl }]));
}

// Without a bound this query pulls every activity (and every attendee row on
// every one of them) a guild has ever logged — it only ever grows, so a guild
// with months of Guild War/PK War history turns "open the tab" into a
// multi-thousand-row fetch+serialize every time. Cap to a trailing window;
// older activities stop appearing in the calendar/search past this point.
const ACTIVITY_LIST_WINDOW_DAYS = 90;

export async function listActivities(guildId: string, actorId: string) {
  const membership = await requireActiveMember(actorId, guildId);

  const cutoff = new Date(Date.now() - ACTIVITY_LIST_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const activities = await prisma.guildActivity.findMany({
    where: { guildId, scheduledAt: { gte: cutoff } },
    orderBy: { scheduledAt: "desc" },
    include: { attendees: { select: { userId: true, status: true } } },
  });

  const userIds: string[] = [];
  for (const a of activities) {
    userIds.push(a.creatorId);
    for (const att of a.attendees) userIds.push(att.userId);
  }
  const userMap = await hydrateUsers(userIds);

  return {
    canManage: OFFICER_ROLES.includes(membership.role),
    viewerRole: membership.role,
    activities: activities.map((a) => serializeActivity(a, userMap, actorId)),
  };
}

interface ActivityInput {
  type?: string;
  title?: string;
  location?: string | null;
  opponent?: string | null;
  notes?: string | null;
  scheduledAt?: string;
  status?: string;
  result?: string | null;
  scoreFor?: number | null;
  scoreAgainst?: number | null;
  repeatInterval?: string | null;
}

export async function createActivity(
  guildId: string,
  actorId: string,
  payload: ActivityInput,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireOfficer(actorId, guildId);

  const type = await validateActivityType(guildId, payload.type);
  const title = validText(payload.title, "Title");
  const scheduled = new Date(payload.scheduledAt ?? "");
  if (Number.isNaN(scheduled.getTime())) throw new BadRequestError("A valid date & time is required");
  const repeatInterval = validRepeatInterval(payload.repeatInterval);

  const activity = await prisma.guildActivity.create({
    data: {
      guildId,
      type,
      title,
      location: optText(payload.location),
      opponent: optText(payload.opponent, 120),
      notes: optText(payload.notes, 1000),
      scheduledAt: scheduled,
      repeatInterval,
      creatorId: actorId,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "GUILD_ACTIVITY_CREATED",
    target: "GuildActivity",
    targetId: activity.id,
    detail: { type, title, scheduledAt: scheduled.toISOString() },
    ipAddress,
    userAgent,
  });

  return listActivities(guildId, actorId);
}

export async function updateActivity(
  guildId: string,
  actorId: string,
  activityId: string,
  payload: ActivityInput,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireOfficer(actorId, guildId);

  const existing = await prisma.guildActivity.findUnique({ where: { id: activityId } });
  if (!existing || existing.guildId !== guildId) throw new NotFoundError("Activity not found");

  const data: Record<string, unknown> = {};
  if (payload.type !== undefined) {
    data["type"] = payload.type === existing.type ? existing.type : await validateActivityType(guildId, payload.type);
  }
  if (payload.title !== undefined) data["title"] = validText(payload.title, "Title");
  if (payload.location !== undefined) data["location"] = optText(payload.location);
  if (payload.opponent !== undefined) data["opponent"] = optText(payload.opponent, 120);
  if (payload.notes !== undefined) data["notes"] = optText(payload.notes, 1000);
  if (payload.scheduledAt !== undefined) {
    const scheduled = new Date(payload.scheduledAt);
    if (Number.isNaN(scheduled.getTime())) throw new BadRequestError("A valid date & time is required");
    data["scheduledAt"] = scheduled;
  }
  if (payload.status !== undefined) {
    if (!ACTIVITY_STATUSES.includes(payload.status as (typeof ACTIVITY_STATUSES)[number])) {
      throw new BadRequestError("Invalid status");
    }
    data["status"] = payload.status;
  }
  if (payload.result !== undefined) {
    if (payload.result === null || payload.result === "") {
      data["result"] = null;
    } else if (ACTIVITY_RESULTS.includes(payload.result as (typeof ACTIVITY_RESULTS)[number])) {
      data["result"] = payload.result;
    } else {
      throw new BadRequestError("Invalid result");
    }
  }
  if (payload.scoreFor !== undefined) {
    data["scoreFor"] = payload.scoreFor === null ? null : Math.max(0, Math.trunc(Number(payload.scoreFor) || 0));
  }
  if (payload.scoreAgainst !== undefined) {
    data["scoreAgainst"] = payload.scoreAgainst === null ? null : Math.max(0, Math.trunc(Number(payload.scoreAgainst) || 0));
  }
  if (payload.repeatInterval !== undefined) {
    data["repeatInterval"] = validRepeatInterval(payload.repeatInterval);
  }

  const updated = await prisma.guildActivity.update({ where: { id: activityId }, data });

  // Completing an activity with a repeat interval set queues the next
  // occurrence, offset by that interval — carries the interval forward so it
  // keeps repeating, like a recurring alarm, without a background job.
  const justCompleted = data["status"] === "COMPLETED" && existing.status !== "COMPLETED";
  if (justCompleted && updated.repeatInterval) {
    const days = REPEAT_INTERVAL_DAYS[updated.repeatInterval as RepeatInterval];
    const nextScheduledAt = new Date(updated.scheduledAt.getTime() + days * 24 * 60 * 60 * 1000);
    await prisma.guildActivity.create({
      data: {
        guildId,
        type: updated.type,
        title: updated.title,
        location: updated.location,
        opponent: updated.opponent,
        notes: updated.notes,
        scheduledAt: nextScheduledAt,
        repeatInterval: updated.repeatInterval,
        creatorId: actorId,
      },
    });
  }

  await writeAuditLog({
    actorId,
    guildId,
    action: "GUILD_ACTIVITY_UPDATED",
    target: "GuildActivity",
    targetId: activityId,
    detail: { fields: Object.keys(data) },
    ipAddress,
    userAgent,
  });

  return listActivities(guildId, actorId);
}

export async function deleteActivity(
  guildId: string,
  actorId: string,
  activityId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await requireOfficer(actorId, guildId);
  const existing = await prisma.guildActivity.findUnique({ where: { id: activityId } });
  if (!existing || existing.guildId !== guildId) throw new NotFoundError("Activity not found");

  await prisma.guildActivity.delete({ where: { id: activityId } });

  await writeAuditLog({
    actorId,
    guildId,
    action: "GUILD_ACTIVITY_DELETED",
    target: "GuildActivity",
    targetId: activityId,
    detail: { title: existing.title, type: existing.type },
    ipAddress,
    userAgent,
  });

  return listActivities(guildId, actorId);
}

export async function setCheckIn(guildId: string, actorId: string, activityId: string, attending: boolean) {
  await requireActiveMember(actorId, guildId);
  const existing = await prisma.guildActivity.findUnique({ where: { id: activityId } });
  if (!existing || existing.guildId !== guildId) throw new NotFoundError("Activity not found");

  if (attending) {
    await prisma.guildActivityAttendee.upsert({
      where: { activityId_userId: { activityId, userId: actorId } },
      create: { activityId, userId: actorId, status: "PENDING" },
      update: {}, // keep existing status (don't downgrade a CONFIRMED)
    });
  } else {
    await prisma.guildActivityAttendee.deleteMany({ where: { activityId, userId: actorId } });
  }

  return listActivities(guildId, actorId);
}

export async function setAttendeeConfirmation(
  guildId: string,
  actorId: string,
  activityId: string,
  targetUserId: string,
  confirmed: boolean,
) {
  await requireOfficer(actorId, guildId);
  const existing = await prisma.guildActivity.findUnique({ where: { id: activityId } });
  if (!existing || existing.guildId !== guildId) throw new NotFoundError("Activity not found");

  await prisma.guildActivityAttendee.upsert({
    where: { activityId_userId: { activityId, userId: targetUserId } },
    create: { activityId, userId: targetUserId, status: confirmed ? "CONFIRMED" : "PENDING" },
    update: { status: confirmed ? "CONFIRMED" : "PENDING" },
  });

  return listActivities(guildId, actorId);
}

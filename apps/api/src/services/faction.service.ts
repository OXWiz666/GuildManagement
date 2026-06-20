import { prisma } from "@guild/db";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";
import { writeAuditLog } from "./audit.service";

function isFactionManagerRole(role: string) {
  return role === "FACTION_LEADER" || role === "ADMIN";
}

async function getActiveMemberships(userId: string) {
  return prisma.guildMember.findMany({
    where: { userId, isActive: true },
  });
}

async function requireFactionMember(userId: string) {
  const memberships = await getActiveMemberships(userId);
  if (memberships.length === 0) {
    throw new ForbiddenError("You must belong to a guild to access faction features");
  }
  return memberships;
}

async function requireFactionManager(userId: string) {
  const memberships = await requireFactionMember(userId);
  if (!memberships.some((m) => isFactionManagerRole(m.role))) {
    throw new ForbiddenError("Only Faction Leaders and Admins can manage faction features");
  }
  return memberships[0]!;
}

function serializeCreator(creator: { id: string; displayName: string; avatarUrl: string | null }) {
  return {
    id: creator.id,
    displayName: creator.displayName,
    avatarUrl: creator.avatarUrl,
  };
}

function serializeAnnouncement(item: any) {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    priority: item.priority,
    status: item.status,
    creatorId: item.creatorId,
    creator: item.creator ? serializeCreator(item.creator) : undefined,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeEvent(item: any) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt ? item.endsAt.toISOString() : null,
    location: item.location,
    status: item.status,
    creatorId: item.creatorId,
    creator: item.creator ? serializeCreator(item.creator) : undefined,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function getFactionMembers(actorId: string) {
  await requireFactionManager(actorId);

  const members = await prisma.guildMember.findMany({
    where: { isActive: true },
    include: {
      guild: { select: { id: true, name: true, slug: true, avatarUrl: true } },
      user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
    },
    orderBy: [{ guild: { name: "asc" } }, { role: "asc" }, { joinedAt: "asc" }],
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    guildId: m.guildId,
    role: m.role,
    rankName: m.rankName,
    ign: m.ign,
    cp: m.cp,
    class: m.class,
    weapon: m.weapon,
    memberCode: m.memberCode,
    joinedAt: m.joinedAt.toISOString(),
    guild: m.guild,
    user: m.user,
  }));
}

export async function listAnnouncements(actorId: string) {
  await requireFactionMember(actorId);
  const announcements = await prisma.factionAnnouncement.findMany({
    where: { status: { not: "DELETED" } },
    include: { creator: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });
  return announcements.map(serializeAnnouncement);
}

export async function createAnnouncement(
  actorId: string,
  payload: { title?: string; body?: string; priority?: string; status?: string },
  ipAddress?: string,
  userAgent?: string,
) {
  const membership = await requireFactionManager(actorId);
  if (!payload.title?.trim() || !payload.body?.trim()) {
    throw new BadRequestError("Announcement title and body are required");
  }

  const announcement = await prisma.factionAnnouncement.create({
    data: {
      title: payload.title.trim(),
      body: payload.body.trim(),
      priority: payload.priority || "NORMAL",
      status: payload.status || "ACTIVE",
      creatorId: actorId,
    },
    include: { creator: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  await writeAuditLog({
    actorId,
    guildId: membership.guildId,
    action: "FACTION_ANNOUNCEMENT_CREATED",
    target: "FactionAnnouncement",
    targetId: announcement.id,
    detail: { title: announcement.title, priority: announcement.priority },
    ipAddress,
    userAgent,
  });

  return serializeAnnouncement(announcement);
}

export async function updateAnnouncement(
  actorId: string,
  announcementId: string,
  payload: { title?: string; body?: string; priority?: string; status?: string },
  ipAddress?: string,
  userAgent?: string,
) {
  const membership = await requireFactionManager(actorId);
  const existing = await prisma.factionAnnouncement.findUnique({ where: { id: announcementId } });
  if (!existing || existing.status === "DELETED") {
    throw new NotFoundError("Faction announcement not found");
  }

  const announcement = await prisma.factionAnnouncement.update({
    where: { id: announcementId },
    data: {
      title: payload.title?.trim(),
      body: payload.body?.trim(),
      priority: payload.priority,
      status: payload.status,
    },
    include: { creator: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  await writeAuditLog({
    actorId,
    guildId: membership.guildId,
    action: "FACTION_ANNOUNCEMENT_UPDATED",
    target: "FactionAnnouncement",
    targetId: announcement.id,
    detail: { ...payload },
    ipAddress,
    userAgent,
  });

  return serializeAnnouncement(announcement);
}

export async function deleteAnnouncement(actorId: string, announcementId: string, ipAddress?: string, userAgent?: string) {
  const membership = await requireFactionManager(actorId);
  const existing = await prisma.factionAnnouncement.findUnique({ where: { id: announcementId } });
  if (!existing || existing.status === "DELETED") {
    throw new NotFoundError("Faction announcement not found");
  }

  await prisma.factionAnnouncement.update({
    where: { id: announcementId },
    data: { status: "DELETED" },
  });

  await writeAuditLog({
    actorId,
    guildId: membership.guildId,
    action: "FACTION_ANNOUNCEMENT_DELETED",
    target: "FactionAnnouncement",
    targetId: announcementId,
    detail: { title: existing.title },
    ipAddress,
    userAgent,
  });

  return { success: true };
}

export async function listEvents(actorId: string) {
  await requireFactionMember(actorId);
  const events = await prisma.factionEvent.findMany({
    where: { status: { not: "DELETED" } },
    include: { creator: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: { startsAt: "asc" },
  });
  return events.map(serializeEvent);
}

export async function createEvent(
  actorId: string,
  payload: { title?: string; description?: string; startsAt?: string; endsAt?: string | null; location?: string; status?: string },
  ipAddress?: string,
  userAgent?: string,
) {
  const membership = await requireFactionManager(actorId);
  if (!payload.title?.trim() || !payload.startsAt) {
    throw new BadRequestError("Event title and start time are required");
  }

  const event = await prisma.factionEvent.create({
    data: {
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      startsAt: new Date(payload.startsAt),
      endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
      location: payload.location?.trim() || null,
      status: payload.status || "ACTIVE",
      creatorId: actorId,
    },
    include: { creator: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  await writeAuditLog({
    actorId,
    guildId: membership.guildId,
    action: "FACTION_EVENT_CREATED",
    target: "FactionEvent",
    targetId: event.id,
    detail: { title: event.title, startsAt: event.startsAt.toISOString() },
    ipAddress,
    userAgent,
  });

  return serializeEvent(event);
}

export async function updateEvent(
  actorId: string,
  eventId: string,
  payload: { title?: string; description?: string; startsAt?: string; endsAt?: string | null; location?: string; status?: string },
  ipAddress?: string,
  userAgent?: string,
) {
  const membership = await requireFactionManager(actorId);
  const existing = await prisma.factionEvent.findUnique({ where: { id: eventId } });
  if (!existing || existing.status === "DELETED") {
    throw new NotFoundError("Faction event not found");
  }

  const event = await prisma.factionEvent.update({
    where: { id: eventId },
    data: {
      title: payload.title?.trim(),
      description: payload.description === undefined ? undefined : payload.description?.trim() || null,
      startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
      endsAt: payload.endsAt === undefined ? undefined : payload.endsAt ? new Date(payload.endsAt) : null,
      location: payload.location === undefined ? undefined : payload.location?.trim() || null,
      status: payload.status,
    },
    include: { creator: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  await writeAuditLog({
    actorId,
    guildId: membership.guildId,
    action: "FACTION_EVENT_UPDATED",
    target: "FactionEvent",
    targetId: event.id,
    detail: { ...payload },
    ipAddress,
    userAgent,
  });

  return serializeEvent(event);
}

export async function deleteEvent(actorId: string, eventId: string, ipAddress?: string, userAgent?: string) {
  const membership = await requireFactionManager(actorId);
  const existing = await prisma.factionEvent.findUnique({ where: { id: eventId } });
  if (!existing || existing.status === "DELETED") {
    throw new NotFoundError("Faction event not found");
  }

  await prisma.factionEvent.update({
    where: { id: eventId },
    data: { status: "DELETED" },
  });

  await writeAuditLog({
    actorId,
    guildId: membership.guildId,
    action: "FACTION_EVENT_DELETED",
    target: "FactionEvent",
    targetId: eventId,
    detail: { title: existing.title },
    ipAddress,
    userAgent,
  });

  return { success: true };
}

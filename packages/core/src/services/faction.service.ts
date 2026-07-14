import * as crypto from "crypto";
import { prisma, FactionJoinDirection, FactionJoinStatus } from "@guild/db";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";
import { writeAuditLog } from "./audit.service";
import { createNotifications } from "./notification.service";
import { getBossRegistryForRotation } from "./dashboard.service";

function isFactionManagerRole(role: string) {
  return role === "FACTION_LEADER" || role === "ADMIN";
}

const GUILD_LEADERSHIP_ROLES_LOCAL = ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"] as const;

function abbreviate(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  if (initials.length >= 2) return initials;
  return name.substring(0, 3).replace(/[^A-Za-z]/g, "").toUpperCase() || "FAC";
}

// Resolves the faction a Faction Leader/Admin manages (their own guild's
// faction), distinct from `requireFactionManagerMemberships` which only
// checks role, not which faction that role applies to.
async function requireManagedFaction(actorId: string) {
  const memberships = await requireFactionManagerMemberships(actorId);
  const managerMembership = memberships.find((m) => isFactionManagerRole(m.role));
  const guild = await prisma.guild.findUnique({
    where: { id: managerMembership!.guildId },
    select: { factionId: true },
  });
  if (!guild?.factionId) {
    throw new BadRequestError("Your guild is not part of a faction");
  }
  return { membership: managerMembership!, factionId: guild.factionId };
}

// A guild's own leadership (Guild Leader / Faction Leader / Admin) — used to
// gate accepting a direct faction invite, distinct from faction-level roles.
async function requireGuildLeadership(actorId: string, guildId: string) {
  const membership = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: actorId, guildId } },
  });
  if (!membership || !membership.isActive || !GUILD_LEADERSHIP_ROLES_LOCAL.includes(membership.role as any)) {
    throw new ForbiddenError("Only that guild's own leadership can respond to this invite");
  }
  return membership;
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

async function requireFactionManagerMemberships(userId: string) {
  const memberships = await requireFactionMember(userId);
  if (!memberships.some((m) => isFactionManagerRole(m.role))) {
    throw new ForbiddenError("Only Faction Leaders and Admins can manage faction features");
  }
  return memberships;
}

async function requireFactionManager(userId: string) {
  const memberships = await requireFactionManagerMemberships(userId);
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
  const { factionId } = await requireManagedFaction(actorId);

  const members = await prisma.guildMember.findMany({
    where: { isActive: true, guild: { factionId } },
    include: {
      guild: { select: { id: true, name: true, slug: true, avatarUrl: true } },
      user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
      customRole: { select: { id: true, name: true, color: true } },
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
    customRole: m.customRole ? { id: m.customRole.id, name: m.customRole.name, color: m.customRole.color } : null,
    guild: m.guild,
    user: m.user,
  }));
}

// ═══════════════════════════════════════════════════
// FACTION OVERVIEW
// A read-only snapshot of the faction the actor's guild belongs to — the
// faction identity plus every member guild (with member counts and leader
// names). Unlike `getFactionMembers`, this is available to ANY faction
// member, not just managers, so a guild that has already joined can see the
// faction it is part of.
// ═══════════════════════════════════════════════════

export async function getFactionOverview(actorId: string) {
  const memberships = await requireFactionMember(actorId);
  const guildIds = memberships.map((m) => m.guildId);

  const ownGuilds = await prisma.guild.findMany({
    where: { id: { in: guildIds } },
    select: { id: true, factionId: true },
  });
  const factionId = ownGuilds.find((g) => g.factionId)?.factionId ?? null;

  const canManage = memberships.some((m) => {
    if (!isFactionManagerRole(m.role)) return false;
    const guild = ownGuilds.find((g) => g.id === m.guildId);
    return guild?.factionId === factionId && factionId !== null;
  });

  if (!factionId) {
    return { faction: null, guilds: [], totalGuilds: 0, totalMembers: 0, canManage: false };
  }

  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    select: { id: true, name: true, slug: true, description: true, avatarUrl: true, createdAt: true },
  });
  if (!faction) {
    return { faction: null, guilds: [], totalGuilds: 0, totalMembers: 0, canManage: false };
  }

  const guilds = await prisma.guild.findMany({
    where: { factionId, isActive: true },
    select: { id: true, name: true, slug: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });
  const memberGuildIds = guilds.map((g) => g.id);

  const counts = memberGuildIds.length
    ? await prisma.guildMember.groupBy({
        by: ["guildId"],
        where: { guildId: { in: memberGuildIds }, isActive: true },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map(counts.map((c) => [c.guildId, c._count._all]));

  const leaders = memberGuildIds.length
    ? await prisma.guildMember.findMany({
        where: { guildId: { in: memberGuildIds }, isActive: true, role: { in: ["GUILD_LEADER", "FACTION_LEADER"] } },
        select: { guildId: true, user: { select: { displayName: true } } },
        orderBy: { role: "asc" },
      })
    : [];
  const leaderMap = new Map<string, string>();
  for (const l of leaders) {
    if (!leaderMap.has(l.guildId)) leaderMap.set(l.guildId, l.user.displayName);
  }

  const ownGuildIds = new Set(guildIds);
  const overviewGuilds = guilds.map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    avatarUrl: g.avatarUrl,
    memberCount: countMap.get(g.id) ?? 0,
    leaderName: leaderMap.get(g.id) ?? null,
    isOwnGuild: ownGuildIds.has(g.id),
  }));

  return {
    faction: {
      id: faction.id,
      name: faction.name,
      slug: faction.slug,
      description: faction.description,
      avatarUrl: faction.avatarUrl,
      createdAt: faction.createdAt.toISOString(),
    },
    guilds: overviewGuilds,
    totalGuilds: overviewGuilds.length,
    totalMembers: overviewGuilds.reduce((sum, g) => sum + g.memberCount, 0),
    canManage,
  };
}

// ═══════════════════════════════════════════════════
// FACTION GUILD INVITES
// Faction Leaders can search for unaffiliated guilds to invite (Multi-Guild
// join requests are created in `inviteGuildToFaction` below).
// ═══════════════════════════════════════════════════

export async function searchGuilds(actorId: string, query: string) {
  const memberships = await requireFactionManagerMemberships(actorId);
  const ownGuildIds = new Set(memberships.map((m) => m.guildId));

  const term = (query || "").trim();
  if (term.length < 2) {
    throw new BadRequestError("Search query must be at least 2 characters");
  }

  const guilds = await prisma.guild.findMany({
    where: {
      isActive: true,
      // Only guilds not already in a faction can be invited/join — a guild
      // belongs to at most one faction at a time.
      factionId: null,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { slug: { contains: term, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      avatarUrl: true,
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  if (guilds.length === 0) return [];

  const guildIds = guilds.map((g) => g.id);

  // Active member counts per guild
  const counts = await prisma.guildMember.groupBy({
    by: ["guildId"],
    where: { guildId: { in: guildIds }, isActive: true },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.guildId, c._count._all]));

  // Resolve a representative leader name per guild
  const leaders = await prisma.guildMember.findMany({
    where: {
      guildId: { in: guildIds },
      isActive: true,
      role: { in: ["GUILD_LEADER", "FACTION_LEADER"] },
    },
    select: { guildId: true, user: { select: { displayName: true } } },
    orderBy: { role: "asc" },
  });
  const leaderMap = new Map<string, string>();
  for (const l of leaders) {
    if (!leaderMap.has(l.guildId)) leaderMap.set(l.guildId, l.user.displayName);
  }

  return guilds.map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    description: g.description,
    avatarUrl: g.avatarUrl,
    memberCount: countMap.get(g.id) ?? 0,
    leaderName: leaderMap.get(g.id) ?? null,
    isOwnGuild: ownGuildIds.has(g.id),
  }));
}

// ═══════════════════════════════════════════════════
// MULTI-GUILD: FACTION JOIN REQUESTS
// A guild joins a faction one of two ways, both two-sided/pending:
//  - CODE_REDEEMED: a Guild Leader redeems the Faction's invite code; the
//    Faction Leader approves.
//  - DIRECT_INVITE: a Faction Leader invites a specific unaffiliated guild;
//    that guild's OWN leadership approves.
// Approval never auto-enrolls the new guild into any boss rotation — see
// `lockRotationParticipantsExcluding` below.
// ═══════════════════════════════════════════════════

async function assertGuildJoinable(guildId: string) {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { id: true, name: true, isActive: true, factionId: true },
  });
  if (!guild || !guild.isActive) {
    throw new NotFoundError("Guild not found or inactive");
  }
  if (guild.factionId) {
    throw new BadRequestError("This guild already belongs to a faction");
  }
  const pending = await prisma.factionJoinRequest.findFirst({
    where: { guildId, status: FactionJoinStatus.PENDING },
  });
  if (pending) {
    throw new BadRequestError("This guild already has a pending faction join request");
  }
  return guild;
}

export async function getFactionInviteCode(actorId: string) {
  const { factionId } = await requireManagedFaction(actorId);
  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    select: { inviteCode: true },
  });
  return { inviteCode: faction!.inviteCode };
}

export async function regenerateFactionInviteCode(
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const { membership, factionId } = await requireManagedFaction(actorId);
  const current = await prisma.faction.findUnique({ where: { id: factionId }, select: { name: true } });
  const newCode = `${abbreviate(current!.name)}-FAC-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const faction = await prisma.faction.update({
    where: { id: factionId },
    data: { inviteCode: newCode },
  });

  await writeAuditLog({
    actorId,
    guildId: membership.guildId,
    action: "FACTION_INVITE_CODE_REGENERATED",
    target: "Faction",
    targetId: factionId,
    ipAddress,
    userAgent,
  });

  return { inviteCode: faction.inviteCode };
}

export async function redeemFactionInviteCode(
  actorId: string,
  code: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const trimmed = (code || "").trim();
  if (!trimmed) {
    throw new BadRequestError("An invite code is required");
  }

  // Actor must lead an unaffiliated guild.
  const memberships = await prisma.guildMember.findMany({
    where: { userId: actorId, isActive: true, role: { in: [...GUILD_LEADERSHIP_ROLES_LOCAL] } },
    include: { guild: { select: { id: true, name: true, isActive: true, factionId: true } } },
  });
  const eligible = memberships.find((m) => m.guild.isActive && !m.guild.factionId);
  if (!eligible) {
    throw new ForbiddenError("You must lead a guild that is not already in a faction");
  }

  const faction = await prisma.faction.findFirst({
    where: { inviteCode: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!faction) {
    throw new NotFoundError("Invalid faction invite code");
  }

  await assertGuildJoinable(eligible.guildId);

  const request = await prisma.factionJoinRequest.create({
    data: {
      factionId: faction.id,
      guildId: eligible.guildId,
      direction: FactionJoinDirection.CODE_REDEEMED,
      status: FactionJoinStatus.PENDING,
    },
  });

  const factionLeaders = await prisma.guildMember.findMany({
    where: { guild: { factionId: faction.id }, isActive: true, role: { in: ["FACTION_LEADER", "ADMIN"] } },
    select: { userId: true },
  });
  await createNotifications(
    [...new Set(factionLeaders.map((l) => l.userId))].map((userId) => ({
      userId,
      type: "FACTION_JOIN_REQUESTED",
      title: "Faction join request",
      body: `${eligible.guild.name} redeemed your invite code and wants to join the faction.`,
      metadata: { requestId: request.id, guildId: eligible.guildId, guildName: eligible.guild.name },
    })),
  );

  await writeAuditLog({
    actorId,
    guildId: eligible.guildId,
    action: "FACTION_JOIN_REQUESTED",
    target: "FactionJoinRequest",
    targetId: request.id,
    detail: { factionId: faction.id, factionName: faction.name, direction: "CODE_REDEEMED" },
    ipAddress,
    userAgent,
  });

  return { requestId: request.id, factionName: faction.name };
}

export async function inviteGuildToFaction(
  actorId: string,
  guildId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const { membership, factionId } = await requireManagedFaction(actorId);

  if (!guildId?.trim()) {
    throw new BadRequestError("A target guild is required");
  }

  const guild = await assertGuildJoinable(guildId);

  const request = await prisma.factionJoinRequest.create({
    data: {
      factionId,
      guildId: guild.id,
      invitedByUserId: actorId,
      direction: FactionJoinDirection.DIRECT_INVITE,
      status: FactionJoinStatus.PENDING,
    },
  });

  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { displayName: true } });
  const actorName = actor?.displayName || "A Faction Leader";

  const leaders = await prisma.guildMember.findMany({
    where: { guildId: guild.id, isActive: true, role: { in: [...GUILD_LEADERSHIP_ROLES_LOCAL] } },
    select: { userId: true },
  });
  const uniqueLeaderIds = [...new Set(leaders.map((l) => l.userId))];
  if (uniqueLeaderIds.length > 0) {
    await createNotifications(
      uniqueLeaderIds.map((userId) => ({
        userId,
        type: "FACTION_GUILD_INVITE",
        title: "Faction invitation",
        body: `${actorName} invited ${guild.name} to join the faction.`,
        metadata: { requestId: request.id, guildId: guild.id, guildName: guild.name, invitedBy: actorId },
      })),
    );
  }

  await writeAuditLog({
    actorId,
    guildId: membership.guildId,
    action: "FACTION_GUILD_INVITED",
    target: "FactionJoinRequest",
    targetId: request.id,
    detail: { guildId: guild.id, guildName: guild.name, notifiedLeaders: uniqueLeaderIds.length },
    ipAddress,
    userAgent,
  });

  return { requestId: request.id, guildId: guild.id, guildName: guild.name, notifiedLeaders: uniqueLeaderIds.length };
}

function serializeJoinRequest(r: any) {
  return {
    id: r.id,
    factionId: r.factionId,
    guildId: r.guildId,
    guildName: r.guild?.name ?? null,
    guildAvatarUrl: r.guild?.avatarUrl ?? null,
    invitedByUserId: r.invitedByUserId,
    direction: r.direction,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listPendingForFaction(actorId: string) {
  const { factionId } = await requireManagedFaction(actorId);
  const requests = await prisma.factionJoinRequest.findMany({
    where: { factionId, status: FactionJoinStatus.PENDING },
    include: { guild: { select: { name: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
  return requests.map(serializeJoinRequest);
}

export async function listPendingForGuild(actorId: string, guildId: string) {
  await requireGuildLeadership(actorId, guildId);
  const requests = await prisma.factionJoinRequest.findMany({
    where: { guildId, status: FactionJoinStatus.PENDING, direction: FactionJoinDirection.DIRECT_INVITE },
    include: { guild: { select: { name: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
  return requests.map(serializeJoinRequest);
}

/**
 * When a guild joins a faction, it must be excluded from EVERY boss rotation
 * — including bosses no faction leader has ever customized — not just the
 * ones already configured. A not-yet-configured boss defaults to "every
 * active guild," which would silently include the newcomer. So we lock in
 * an explicit participant list (the faction's pre-existing guilds, minus the
 * one that just joined) for every catalog boss lacking one, leaving existing
 * guilds' participation unchanged while the new guild starts opted out of
 * everything until the faction leader explicitly adds it.
 */
async function lockRotationParticipantsExcluding(factionId: string, excludedGuildId: string) {
  const [bosses, existingRotations, priorGuilds] = await Promise.all([
    getBossRegistryForRotation(),
    prisma.bossRotation.findMany({ where: { factionId } }),
    prisma.guild.findMany({ where: { factionId, isActive: true, id: { not: excludedGuildId } }, select: { id: true } }),
  ]);
  const rotationByName = new Map(existingRotations.map((r) => [r.bossName, r]));
  const priorGuildIds = priorGuilds.map((g) => g.id);

  const toLock = bosses.filter((b) => !rotationByName.get(b.name)?.participantsConfigured);
  if (toLock.length === 0) return;

  await prisma.$transaction(
    toLock.map((boss) => {
      const prev = rotationByName.get(boss.name);
      const clampedIndex = priorGuildIds.length
        ? Math.min(prev?.currentIndex ?? 0, priorGuildIds.length - 1)
        : 0;
      return prisma.bossRotation.upsert({
        where: { factionId_bossName: { factionId, bossName: boss.name } },
        create: {
          factionId,
          bossName: boss.name,
          queueGuildIds: priorGuildIds,
          currentIndex: 0,
          participantsConfigured: true,
        },
        update: {
          queueGuildIds: priorGuildIds,
          currentIndex: clampedIndex,
          participantsConfigured: true,
        },
      });
    }),
  );
}

export async function approveFactionJoinRequest(
  actorId: string,
  requestId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const request = await prisma.factionJoinRequest.findUnique({
    where: { id: requestId },
    include: { guild: { select: { id: true, name: true, factionId: true } }, faction: { select: { id: true, name: true } } },
  });
  if (!request || request.status !== FactionJoinStatus.PENDING) {
    throw new NotFoundError("Faction join request not found or already resolved");
  }

  if (request.direction === FactionJoinDirection.CODE_REDEEMED) {
    const { factionId } = await requireManagedFaction(actorId);
    if (factionId !== request.factionId) {
      throw new ForbiddenError("Only that faction's own leader can approve this request");
    }
  } else {
    await requireGuildLeadership(actorId, request.guildId);
  }

  if (request.guild.factionId) {
    throw new BadRequestError("This guild has already joined a faction");
  }

  await prisma.$transaction([
    prisma.guild.update({ where: { id: request.guildId }, data: { factionId: request.factionId } }),
    prisma.factionJoinRequest.update({
      where: { id: requestId },
      data: { status: FactionJoinStatus.APPROVED, respondedByUserId: actorId },
    }),
  ]);

  await lockRotationParticipantsExcluding(request.factionId, request.guildId);

  await writeAuditLog({
    actorId,
    guildId: request.guildId,
    action: "FACTION_JOIN_APPROVED",
    target: "FactionJoinRequest",
    targetId: requestId,
    detail: { factionId: request.factionId, factionName: request.faction.name, direction: request.direction },
    ipAddress,
    userAgent,
  });

  return { success: true, factionId: request.factionId, guildId: request.guildId };
}

export async function rejectFactionJoinRequest(
  actorId: string,
  requestId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const request = await prisma.factionJoinRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== FactionJoinStatus.PENDING) {
    throw new NotFoundError("Faction join request not found or already resolved");
  }

  if (request.direction === FactionJoinDirection.CODE_REDEEMED) {
    const { factionId } = await requireManagedFaction(actorId);
    if (factionId !== request.factionId) {
      throw new ForbiddenError("Only that faction's own leader can reject this request");
    }
  } else {
    await requireGuildLeadership(actorId, request.guildId);
  }

  await prisma.factionJoinRequest.update({
    where: { id: requestId },
    data: { status: FactionJoinStatus.REJECTED, respondedByUserId: actorId },
  });

  await writeAuditLog({
    actorId,
    guildId: request.guildId,
    action: "FACTION_JOIN_REJECTED",
    target: "FactionJoinRequest",
    targetId: requestId,
    detail: { factionId: request.factionId, direction: request.direction },
    ipAddress,
    userAgent,
  });

  return { success: true };
}

export async function removeGuildFromFaction(
  actorId: string,
  guildId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { id: true, name: true, factionId: true } });
  if (!guild || !guild.factionId) {
    throw new BadRequestError("This guild is not part of a faction");
  }
  const factionId = guild.factionId;

  // Either the faction's own manager, or that guild's own leadership, may remove it.
  let authorized = false;
  try {
    const { factionId: managedFactionId } = await requireManagedFaction(actorId);
    authorized = managedFactionId === factionId;
  } catch {
    // not a faction manager — fall through to self-leave check
  }
  if (!authorized) {
    await requireGuildLeadership(actorId, guildId);
    authorized = true;
  }

  await prisma.guild.update({ where: { id: guildId }, data: { factionId: null } });

  // Purge this guild from every rotation queue in its old faction.
  const rotations = await prisma.bossRotation.findMany({ where: { factionId } });
  await prisma.$transaction(
    rotations
      .filter((r) => Array.isArray(r.queueGuildIds) && (r.queueGuildIds as string[]).includes(guildId))
      .map((r) => {
        const remaining = (r.queueGuildIds as string[]).filter((id) => id !== guildId);
        const clampedIndex = remaining.length ? Math.min(r.currentIndex, remaining.length - 1) : 0;
        return prisma.bossRotation.update({
          where: { id: r.id },
          data: { queueGuildIds: remaining, currentIndex: clampedIndex },
        });
      }),
  );

  // Clear this guild's low-boss day assignments in its old faction.
  const lowRotation = await prisma.bossLowRotation.findUnique({ where: { factionId } });
  if (lowRotation) {
    const weekly = (lowRotation.weekly && typeof lowRotation.weekly === "object" ? lowRotation.weekly : {}) as Record<string, string>;
    const days = (lowRotation.days && typeof lowRotation.days === "object" ? lowRotation.days : {}) as Record<string, string>;
    const cleanedWeekly = Object.fromEntries(Object.entries(weekly).filter(([, v]) => v !== guildId));
    const cleanedDays = Object.fromEntries(Object.entries(days).filter(([, v]) => v !== guildId));
    await prisma.bossLowRotation.update({
      where: { factionId },
      data: { weekly: cleanedWeekly, days: cleanedDays },
    });
  }

  await writeAuditLog({
    actorId,
    guildId,
    action: "GUILD_LEFT_FACTION",
    target: "Guild",
    targetId: guildId,
    detail: { factionId, guildName: guild.name },
    ipAddress,
    userAgent,
  });

  return { success: true };
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

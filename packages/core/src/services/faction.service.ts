import * as crypto from "crypto";
import {
  prisma,
  Prisma,
  FactionJoinDirection,
  FactionJoinStatus,
  FactionGuildStatus,
  FactionStatus,
  SubscriptionStatus,
  type FactionRoleType,
} from "@guild/db";
import { AUDIT_ACTIONS, orgNameSchema, slugify } from "@guild/shared";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { writeAuditLog } from "./audit.service";
import { writeFactionAuditLog } from "./factionAudit.service";
import { createNotifications } from "./notification.service";
import { getBossRegistryForRotation } from "./dashboard.service";
import { getCachedActiveMemberships } from "../lib/faction-membership-cache";

function isFactionManagerRole(role: string) {
  return role === "FACTION_LEADER" || role === "ADMIN";
}

const GUILD_LEADERSHIP_ROLES_LOCAL = ["GUILD_LEADER", "FACTION_LEADER", "ADMIN"] as const;
const ACTIVE_SUBSCRIPTION_STATES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];
const FREE_FACTION_RENAME_LIMIT = 2;

type FactionSubscriptionSnapshot = {
  status: string;
  plan: { name: string };
} | null;

function getFactionRenameQuota(
  faction: { nameChangeCount: number },
  activeSubscription: FactionSubscriptionSnapshot,
) {
  const isSubscribed = Boolean(activeSubscription);
  const remainingNameChanges = isSubscribed
    ? null
    : Math.max(0, FREE_FACTION_RENAME_LIMIT - faction.nameChangeCount);

  return {
    nameChangeCount: faction.nameChangeCount,
    nameChangeLimit: isSubscribed ? null : FREE_FACTION_RENAME_LIMIT,
    remainingNameChanges,
    canRename: isSubscribed || (remainingNameChanges ?? 0) > 0,
    isSubscribed,
    subscriptionStatus: activeSubscription?.status ?? null,
    planName: activeSubscription?.plan.name ?? null,
  };
}

async function getActiveFactionSubscription(factionId: string) {
  return prisma.subscription.findFirst({
    where: {
      status: { in: ACTIVE_SUBSCRIPTION_STATES },
      guild: { factionId },
    },
    orderBy: [{ currentPeriodEnd: "desc" }, { createdAt: "desc" }],
    select: { status: true, plan: { select: { name: true } } },
  });
}

async function uniqueFactionSlug(name: string, factionId: string): Promise<string> {
  const base = slugify(name) || "faction";

  const isTaken = async (slug: string) =>
    Boolean(await prisma.faction.findFirst({ where: { slug, NOT: { id: factionId } }, select: { id: true } }));

  if (!(await isTaken(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${crypto.randomBytes(2).toString("hex")}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

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

async function uniqueFactionInviteCode(name: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = `${abbreviate(name)}-FAC-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await prisma.faction.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  return `${abbreviate(name)}-FAC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

// Resolves the faction a Faction Leader/Admin manages (their own guild's
// faction), distinct from `requireFactionManagerMemberships` which only
// checks role, not which faction that role applies to. `guild.factionId` now
// comes embedded in the cached membership row (see getCachedActiveMemberships),
// so this no longer pays a second, separate `guild.findUnique` round trip.
async function requireManagedFaction(actorId: string) {
  const memberships = await requireFactionManagerMemberships(actorId);
  const managerMembership = memberships.find((m) => isFactionManagerRole(m.role));
  const factionId = managerMembership?.guild.factionId;
  if (!factionId) {
    throw new BadRequestError("Your guild is not part of a faction");
  }
  return { membership: managerMembership!, factionId };
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
  return getCachedActiveMemberships(userId);
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

// Resolves the guild role an actor was wearing when performing a faction
// action, for the audit-log's actorRole snapshot. Prefers a membership
// within the faction itself; falls back to any active membership.
async function resolveActorFactionRole(actorId: string, factionId: string): Promise<string> {
  const memberships = await getCachedActiveMemberships(actorId);
  const inFaction = memberships.find((m) => m.guild.factionId === factionId);
  return inFaction?.role ?? memberships[0]?.role ?? "UNKNOWN";
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
// FACTION ACCOUNTING
// Read-only rollup of every member guild's treasury — Faction Leader/Admin
// or a member holding the TREASURER capability grant (see FactionRoleType).
// Guild currencies are independently configurable (GuildSettings), so
// balances are never summed across differing currency codes — the
// per-guild breakdown always keeps its own currency, and the faction-wide
// `totals` only combine guilds that share the same currencyCode.
// ═══════════════════════════════════════════════════
async function requireFactionAccountingViewer(actorId: string): Promise<{ factionId: string; role: string }> {
  const memberships = await getCachedActiveMemberships(actorId);
  const managerMembership = memberships.find((m) => isFactionManagerRole(m.role) && m.guild.factionId);
  if (managerMembership?.guild.factionId) {
    return { factionId: managerMembership.guild.factionId, role: managerMembership.role };
  }

  const withFaction = memberships.find((m) => m.guild.factionId);
  if (!withFaction?.guild.factionId) {
    throw new ForbiddenError("You must belong to a faction to view its accounting");
  }

  const grant = await prisma.factionRoleAssignment.findFirst({
    where: { factionId: withFaction.guild.factionId, role: "TREASURER", guildMember: { userId: actorId, isActive: true } },
    select: { id: true },
  });
  if (!grant) {
    throw new ForbiddenError("Only Faction Leaders, Admins, and Faction Treasurers can view faction accounting");
  }
  return { factionId: withFaction.guild.factionId, role: withFaction.role };
}

export async function getFactionAccounting(actorId: string, page: number = 1, limit: number = 25) {
  const { factionId } = await requireFactionAccountingViewer(actorId);
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 25;
  const skip = (safePage - 1) * safeLimit;

  const guilds = await prisma.guild.findMany({
    where: { factionId, isActive: true },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      settings: {
        select: { currencyCode: true, currencySymbol: true, secondaryCurrencyCode: true, secondaryCurrencySymbol: true },
      },
    },
    orderBy: { name: "asc" },
  });
  const guildIds = guilds.map((g) => g.id);
  if (guildIds.length === 0) {
    return {
      guilds: [],
      totals: [],
      transactions: [],
      pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 1 },
    };
  }

  const [treasuryAggregates, totalTransactions, ledgerHistory] = await Promise.all([
    prisma.ledgerEntry.groupBy({
      by: ["guildId", "currency", "accountType", "entryType"],
      where: { guildId: { in: guildIds }, accountType: { in: ["GUILD_FUND", "TAX"] } },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.count({ where: { guildId: { in: guildIds } } }),
    prisma.ledgerEntry.findMany({
      where: { guildId: { in: guildIds } },
      orderBy: { createdAt: "desc" },
      skip,
      take: safeLimit,
    }),
  ]);

  const guildNameMap = new Map(guilds.map((g) => [g.id, g.name] as const));

  const sum = (guildId: string, currency: string, accountType: "GUILD_FUND" | "TAX", entryType: "CREDIT" | "DEBIT"): bigint =>
    treasuryAggregates.find(
      (r) => r.guildId === guildId && r.currency === currency && r.accountType === accountType && r.entryType === entryType,
    )?._sum.amount || 0n;

  const guildBreakdown = guilds.map((g) => {
    const currencyCode = g.settings?.currencyCode || "PHP";
    const currencySymbol = g.settings?.currencySymbol || "₱";
    const secondaryCode = g.settings?.secondaryCurrencyCode;
    const secondarySymbol = g.settings?.secondaryCurrencySymbol;

    const fundBalanceCents = sum(g.id, currencyCode, "GUILD_FUND", "CREDIT") - sum(g.id, currencyCode, "GUILD_FUND", "DEBIT");
    const taxBalanceCents = sum(g.id, currencyCode, "TAX", "CREDIT") - sum(g.id, currencyCode, "TAX", "DEBIT");
    const totalExpensesCents = sum(g.id, currencyCode, "GUILD_FUND", "DEBIT") + sum(g.id, currencyCode, "TAX", "DEBIT");

    const secondary = secondaryCode
      ? {
          currencyCode: secondaryCode,
          currencySymbol: secondarySymbol || "💎",
          fundBalance: Number(sum(g.id, secondaryCode, "GUILD_FUND", "CREDIT") - sum(g.id, secondaryCode, "GUILD_FUND", "DEBIT")) / 100,
          taxBalance: Number(sum(g.id, secondaryCode, "TAX", "CREDIT") - sum(g.id, secondaryCode, "TAX", "DEBIT")) / 100,
          totalExpenses: Number(sum(g.id, secondaryCode, "GUILD_FUND", "DEBIT") + sum(g.id, secondaryCode, "TAX", "DEBIT")) / 100,
        }
      : null;

    return {
      guildId: g.id,
      guildName: g.name,
      guildAvatarUrl: g.avatarUrl,
      currencyCode,
      currencySymbol,
      fundBalance: Number(fundBalanceCents) / 100,
      taxBalance: Number(taxBalanceCents) / 100,
      totalExpenses: Number(totalExpensesCents) / 100,
      secondary,
    };
  });

  // Faction-wide totals — only combined across guilds sharing the same
  // currencyCode, since two guilds can each configure a different currency.
  const totalsMap = new Map<
    string,
    { currencyCode: string; currencySymbol: string; fundBalance: number; taxBalance: number; totalExpenses: number; guildCount: number }
  >();
  for (const g of guildBreakdown) {
    const existing = totalsMap.get(g.currencyCode);
    const t = existing || { currencyCode: g.currencyCode, currencySymbol: g.currencySymbol, fundBalance: 0, taxBalance: 0, totalExpenses: 0, guildCount: 0 };
    t.fundBalance += g.fundBalance;
    t.taxBalance += g.taxBalance;
    t.totalExpenses += g.totalExpenses;
    t.guildCount += 1;
    totalsMap.set(g.currencyCode, t);
  }

  const transactions = ledgerHistory.map((item) => ({
    id: item.id,
    guildId: item.guildId,
    guildName: guildNameMap.get(item.guildId) || "Unknown guild",
    accountType: item.accountType,
    currency: item.currency,
    amount: Number(item.amount) / 100,
    entryType: item.entryType,
    referenceType: item.referenceType,
    description: item.description,
    createdAt: item.createdAt.toISOString(),
  }));

  return {
    guilds: guildBreakdown,
    totals: Array.from(totalsMap.values()),
    transactions,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: totalTransactions,
      totalPages: Math.max(1, Math.ceil(totalTransactions / safeLimit)),
    },
  };
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

  // `guild.factionId` comes embedded in the cached membership row (see
  // getCachedActiveMemberships), so this no longer needs its own
  // `guild.findMany` round trip — same data, one fewer query.
  const factionId = memberships.find((m) => m.guild.factionId)?.guild.factionId ?? null;

  const canManage = memberships.some(
    (m) => isFactionManagerRole(m.role) && m.guild.factionId === factionId && factionId !== null,
  );

  if (!factionId) {
    return { faction: null, guilds: [], totalGuilds: 0, totalMembers: 0, canManage: false };
  }

  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    select: {
      id: true,
      name: true,
      slug: true,
      nameChangeCount: true,
      description: true,
      avatarUrl: true,
      bannerUrl: true,
      code: true,
      server: true,
      region: true,
      game: true,
      status: true,
      createdAt: true,
    },
  });
  if (!faction) {
    return { faction: null, guilds: [], totalGuilds: 0, totalMembers: 0, canManage: false };
  }

  const [guilds, activeSubscription] = await Promise.all([
    prisma.guild.findMany({
      where: { factionId, isActive: true },
      select: { id: true, name: true, slug: true, avatarUrl: true },
      orderBy: { name: "asc" },
    }),
    getActiveFactionSubscription(factionId),
  ]);
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
      bannerUrl: faction.bannerUrl,
      code: faction.code,
      server: faction.server,
      region: faction.region,
      game: faction.game,
      status: faction.status,
      createdAt: faction.createdAt.toISOString(),
      ...getFactionRenameQuota(faction, activeSubscription),
    },
    guilds: overviewGuilds,
    totalGuilds: overviewGuilds.length,
    totalMembers: overviewGuilds.reduce((sum, g) => sum + g.memberCount, 0),
    canManage,
  };
}

// ═══════════════════════════════════════════════════
// MULTI-GUILD: FACTION JOIN REQUESTS
// A guild joins a faction exactly one way: a Guild Leader redeems the
// Faction's invite code (CODE_REDEEMED), and the Faction Leader approves.
// There is deliberately no guild search / direct-invite path — a faction
// cannot pull in a guild that hasn't chosen to request joining. DIRECT_INVITE
// remains in FactionJoinDirection only to keep historical rows readable; no
// code path creates new ones.
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

export async function createFactionFromGuild(
  actorId: string,
  guildId: string,
  factionName: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const name = orgNameSchema.parse(factionName);
  const membership = await requireGuildLeadership(actorId, guildId);
  const guild = await assertGuildJoinable(guildId);

  const slug = await uniqueFactionSlug(name, crypto.randomUUID());
  const inviteCode = await uniqueFactionInviteCode(name);

  const result = await prisma.$transaction(async (tx) => {
    const faction = await tx.faction.create({
      data: {
        name,
        slug,
        leaderUserId: actorId,
        inviteCode,
      },
      select: { id: true, slug: true, name: true },
    });

    await tx.guild.update({
      where: { id: guildId },
      data: { factionId: faction.id },
    });

    await tx.guildMember.update({
      where: { id: membership.id },
      data: {
        role: "FACTION_LEADER",
        rankName: "Faction Leader",
        customRoleId: null,
      },
    });

    await tx.factionGuildMembership.create({
      data: {
        factionId: faction.id,
        guildId,
        status: FactionGuildStatus.ACTIVE,
        joinedAt: new Date(),
        approvedByUserId: actorId,
      },
    });

    return faction;
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.FACTION_CREATED,
    target: "Faction",
    targetId: result.id,
    detail: { name, firstGuildId: guildId, firstGuildName: guild.name },
    ipAddress,
    userAgent,
  });
  await writeFactionAuditLog({
    factionId: result.id,
    actorId,
    actorRole: "FACTION_LEADER",
    action: "FACTION_CREATED",
    entityType: "Faction",
    entityId: result.id,
    newValue: { name, firstGuildId: guildId, firstGuildName: guild.name },
    ipAddress,
    userAgent,
  });
  await writeFactionAuditLog({
    factionId: result.id,
    actorId,
    actorRole: "FACTION_LEADER",
    action: "GUILD_ADDED",
    entityType: "Guild",
    entityId: guildId,
    newValue: { guildName: guild.name, source: "create_from_guild" },
    ipAddress,
    userAgent,
  });

  return { factionId: result.id, factionSlug: result.slug, guildId };
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
    prisma.factionGuildMembership.create({
      data: {
        factionId: request.factionId,
        guildId: request.guildId,
        status: FactionGuildStatus.ACTIVE,
        joinedAt: new Date(),
        approvedByUserId: actorId,
      },
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
  const actorRole = await resolveActorFactionRole(actorId, request.factionId);
  await writeFactionAuditLog({
    factionId: request.factionId,
    actorId,
    actorRole,
    action: "GUILD_ADDED",
    entityType: "Guild",
    entityId: request.guildId,
    newValue: { guildName: request.guild.name, direction: request.direction },
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
  let managerInitiated = false;
  try {
    const { factionId: managedFactionId } = await requireManagedFaction(actorId);
    authorized = managedFactionId === factionId;
    managerInitiated = authorized;
  } catch {
    // not a faction manager — fall through to self-leave check
  }
  if (!authorized) {
    await requireGuildLeadership(actorId, guildId);
    authorized = true;
  }

  await prisma.guild.update({ where: { id: guildId }, data: { factionId: null } });

  await prisma.factionGuildMembership.updateMany({
    where: { factionId, guildId, status: { in: [FactionGuildStatus.ACTIVE, FactionGuildStatus.SUSPENDED, FactionGuildStatus.PENDING] } },
    data: { status: managerInitiated ? FactionGuildStatus.REMOVED : FactionGuildStatus.LEFT_FACTION },
  });

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
  const actorRole = await resolveActorFactionRole(actorId, factionId);
  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole,
    action: managerInitiated ? "GUILD_REMOVED" : "GUILD_LEFT",
    entityType: "Guild",
    entityId: guildId,
    previousValue: { guildName: guild.name },
    ipAddress,
    userAgent,
  });

  return { success: true };
}

// ═══════════════════════════════════════════════════
// FACTIONWIDE SYSTEM — PHASE 1: FOUNDATION
// Profile/status lifecycle, richer faction<->guild relationship metadata,
// and faction capability role grants (Officer/Treasurer/Inventory Manager).
// ═══════════════════════════════════════════════════

function serializeFactionGuildMembership(m: any) {
  return {
    id: m.id,
    factionId: m.factionId,
    guildId: m.guildId,
    guildName: m.guild?.name ?? null,
    guildAvatarUrl: m.guild?.avatarUrl ?? null,
    status: m.status,
    joinedAt: m.joinedAt.toISOString(),
    contributionRequirement: m.contributionRequirement,
    assignedFactionRole: m.assignedFactionRole,
    approvedByUserId: m.approvedByUserId,
    notes: m.notes,
    updatedAt: m.updatedAt.toISOString(),
  };
}

function serializeFactionRoleAssignment(a: any) {
  return {
    id: a.id,
    factionId: a.factionId,
    guildMemberId: a.guildMemberId,
    role: a.role,
    grantedByUserId: a.grantedByUserId,
    createdAt: a.createdAt.toISOString(),
    member: a.guildMember
      ? {
          id: a.guildMember.id,
          ign: a.guildMember.ign,
          role: a.guildMember.role,
          userId: a.guildMember.userId,
          displayName: a.guildMember.user?.displayName ?? null,
          avatarUrl: a.guildMember.user?.avatarUrl ?? null,
          guildId: a.guildMember.guildId,
          guildName: a.guildMember.guild?.name ?? null,
        }
      : null,
  };
}

export async function updateFactionProfile(
  actorId: string,
  payload: {
    name?: string;
    description?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    code?: string;
    server?: string;
    region?: string;
    game?: string;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  const { membership, factionId } = await requireManagedFaction(actorId);
  const before = await prisma.faction.findUnique({ where: { id: factionId } });
  if (!before) throw new NotFoundError("Faction not found");

  let nextName: string | undefined;
  if (payload.name !== undefined) {
    const parsedName = orgNameSchema.safeParse(payload.name);
    if (!parsedName.success) {
      throw new ValidationError("Invalid faction name", parsedName.error.flatten());
    }
    nextName = parsedName.data;
  }

  const isNameChanging = nextName !== undefined && nextName !== before.name;
  const activeSubscription = isNameChanging ? await getActiveFactionSubscription(factionId) : null;
  if (isNameChanging && !activeSubscription && before.nameChangeCount >= FREE_FACTION_RENAME_LIMIT) {
    throw new ForbiddenError("Free factions can change their name only twice. Subscribe for unlimited faction renames.");
  }

  const nextSlug = isNameChanging ? await uniqueFactionSlug(nextName!, factionId) : undefined;
  const data: Prisma.FactionUpdateInput = {
    ...(isNameChanging ? { name: nextName, slug: nextSlug, nameChangeCount: { increment: 1 } } : {}),
    description: payload.description === undefined ? undefined : payload.description?.trim() || null,
    avatarUrl: payload.avatarUrl === undefined ? undefined : payload.avatarUrl?.trim() || null,
    bannerUrl: payload.bannerUrl === undefined ? undefined : payload.bannerUrl?.trim() || null,
    code: payload.code === undefined ? undefined : payload.code?.trim() || null,
    server: payload.server === undefined ? undefined : payload.server?.trim() || null,
    region: payload.region === undefined ? undefined : payload.region?.trim() || null,
    game: payload.game === undefined ? undefined : payload.game?.trim() || null,
  };

  let faction;
  try {
    if (isNameChanging && !activeSubscription) {
      const updated = await prisma.faction.updateMany({
        where: { id: factionId, nameChangeCount: { lt: FREE_FACTION_RENAME_LIMIT } },
        data: data as Prisma.FactionUpdateManyMutationInput,
      });
      if (updated.count === 0) {
        throw new ForbiddenError("Free factions can change their name only twice. Subscribe for unlimited faction renames.");
      }
      faction = await prisma.faction.findUniqueOrThrow({ where: { id: factionId } });
    } else {
      faction = await prisma.faction.update({
        where: { id: factionId },
        data,
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Faction name, slug, or code is already taken");
    }
    throw error;
  }

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: membership.role,
    action: "FACTION_PROFILE_UPDATED",
    entityType: "Faction",
    entityId: factionId,
    previousValue: {
      name: before.name,
      description: before.description,
      avatarUrl: before.avatarUrl,
      bannerUrl: before.bannerUrl,
      code: before.code,
      server: before.server,
      region: before.region,
      game: before.game,
    },
    newValue: payload,
    ipAddress,
    userAgent,
  });

  return { faction };
}

/**
 * Faction status lifecycle (Active/Inactive/Suspended/Archived) is a Super
 * Admin power per the spec's permission matrix — NOT a Faction Leader one.
 * Authorization happens at the route layer via the `requirePlatformAdmin`
 * Hono middleware; this function trusts its caller and just resolves the
 * actor's snapshot role for the audit entry.
 */
export async function updateFactionStatus(
  actorId: string,
  factionId: string,
  status: FactionStatus,
  reason?: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const before = await prisma.faction.findUnique({ where: { id: factionId } });
  if (!before) throw new NotFoundError("Faction not found");

  const faction = await prisma.faction.update({
    where: { id: factionId },
    data: { status, isActive: status === FactionStatus.ACTIVE },
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: "SUPER_ADMIN",
    action: "FACTION_STATUS_CHANGED",
    entityType: "Faction",
    entityId: factionId,
    previousValue: { status: before.status },
    newValue: { status: faction.status },
    reason,
    ipAddress,
    userAgent,
  });

  return { faction };
}

export async function listFactionGuildMemberships(actorId: string) {
  const { factionId } = await requireManagedFaction(actorId);
  const memberships = await prisma.factionGuildMembership.findMany({
    where: { factionId, status: { in: [FactionGuildStatus.PENDING, FactionGuildStatus.ACTIVE, FactionGuildStatus.SUSPENDED] } },
    include: { guild: { select: { name: true, avatarUrl: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map(serializeFactionGuildMembership);
}

export async function updateFactionGuildMembership(
  actorId: string,
  guildId: string,
  payload: { contributionRequirement?: string | null; assignedFactionRole?: string | null; notes?: string | null },
  ipAddress?: string,
  userAgent?: string,
) {
  const { membership, factionId } = await requireManagedFaction(actorId);
  const current = await prisma.factionGuildMembership.findFirst({
    where: { factionId, guildId, status: { in: [FactionGuildStatus.PENDING, FactionGuildStatus.ACTIVE, FactionGuildStatus.SUSPENDED] } },
  });
  if (!current) {
    throw new NotFoundError("This guild has no active membership record in your faction");
  }

  const updated = await prisma.factionGuildMembership.update({
    where: { id: current.id },
    data: {
      contributionRequirement: payload.contributionRequirement === undefined ? undefined : payload.contributionRequirement,
      assignedFactionRole: payload.assignedFactionRole === undefined ? undefined : payload.assignedFactionRole,
      notes: payload.notes === undefined ? undefined : payload.notes,
    },
    include: { guild: { select: { name: true, avatarUrl: true } } },
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: membership.role,
    action: "FACTION_GUILD_MEMBERSHIP_UPDATED",
    entityType: "FactionGuildMembership",
    entityId: current.id,
    previousValue: {
      contributionRequirement: current.contributionRequirement,
      assignedFactionRole: current.assignedFactionRole,
      notes: current.notes,
    },
    newValue: payload,
    ipAddress,
    userAgent,
  });

  return serializeFactionGuildMembership(updated);
}

export async function listFactionRoleAssignments(actorId: string) {
  const { factionId } = await requireManagedFaction(actorId);
  const assignments = await prisma.factionRoleAssignment.findMany({
    where: { factionId },
    include: {
      guildMember: {
        select: {
          id: true,
          ign: true,
          role: true,
          userId: true,
          guildId: true,
          user: { select: { displayName: true, avatarUrl: true } },
          guild: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return assignments.map(serializeFactionRoleAssignment);
}

export async function assignFactionRole(
  actorId: string,
  guildMemberId: string,
  role: FactionRoleType,
  ipAddress?: string,
  userAgent?: string,
) {
  const { membership, factionId } = await requireManagedFaction(actorId);

  const target = await prisma.guildMember.findUnique({
    where: { id: guildMemberId },
    include: { guild: { select: { factionId: true, name: true } }, user: { select: { displayName: true } } },
  });
  if (!target || !target.isActive || target.guild.factionId !== factionId) {
    throw new BadRequestError("Target member must belong to a guild in your faction");
  }

  const assignment = await prisma.factionRoleAssignment.upsert({
    where: { guildMemberId_factionId_role: { guildMemberId, factionId, role } },
    create: { factionId, guildMemberId, role, grantedByUserId: actorId },
    update: {},
    include: {
      guildMember: {
        select: {
          id: true,
          ign: true,
          role: true,
          userId: true,
          guildId: true,
          user: { select: { displayName: true, avatarUrl: true } },
          guild: { select: { name: true } },
        },
      },
    },
  });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: membership.role,
    action: "FACTION_ROLE_GRANTED",
    entityType: "FactionRoleAssignment",
    entityId: assignment.id,
    newValue: { guildMemberId, role, memberName: target.ign ?? target.user.displayName },
    ipAddress,
    userAgent,
  });

  return serializeFactionRoleAssignment(assignment);
}

export async function revokeFactionRole(
  actorId: string,
  assignmentId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const { membership, factionId } = await requireManagedFaction(actorId);
  const assignment = await prisma.factionRoleAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.factionId !== factionId) {
    throw new NotFoundError("Faction role assignment not found");
  }

  await prisma.factionRoleAssignment.delete({ where: { id: assignmentId } });

  await writeFactionAuditLog({
    factionId,
    actorId,
    actorRole: membership.role,
    action: "FACTION_ROLE_REVOKED",
    entityType: "FactionRoleAssignment",
    entityId: assignmentId,
    previousValue: { guildMemberId: assignment.guildMemberId, role: assignment.role },
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
    // No pagination UI exists for this list — a bare cap keeps a long-lived
    // faction's full announcement history from being fetched on every read.
    take: 200,
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
    // No pagination UI exists for this list — a bare cap keeps a long-lived
    // faction's full event history from being fetched on every read.
    take: 200,
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

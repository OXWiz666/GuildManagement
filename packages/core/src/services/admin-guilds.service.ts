import { prisma } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { NotFoundError, BadRequestError } from "../utils/errors";

// ─── Platform Guild Management (Phase 3) ─────────────────────────────

export type GuildStatus = "active" | "suspended" | "deleted";

function deriveGuildStatus(g: { deletedAt: Date | null; suspendedAt: Date | null }): GuildStatus {
  if (g.deletedAt) return "deleted";
  if (g.suspendedAt) return "suspended";
  return "active";
}

export async function listGuilds(opts: {
  search?: string;
  status?: GuildStatus;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  const take = Math.min(opts.limit || 25, 100);

  const where: any = {};
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { slug: { contains: s, mode: "insensitive" } },
    ];
  }
  switch (opts.status) {
    case "deleted":
      where.deletedAt = { not: null };
      break;
    case "suspended":
      where.suspendedAt = { not: null };
      where.deletedAt = null;
      break;
    case "active":
      where.deletedAt = null;
      where.suspendedAt = null;
      break;
  }

  const [rows, total] = await Promise.all([
    prisma.guild.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        name: true,
        slug: true,
        avatarUrl: true,
        createdAt: true,
        suspendedAt: true,
        deletedAt: true,
        _count: { select: { members: true } },
        subscriptions: {
          where: { status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
          select: { id: true, status: true, plan: { select: { name: true } } },
          take: 1,
        },
      },
    }),
    prisma.guild.count({ where }),
  ]);

  return {
    guilds: rows.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      avatarUrl: g.avatarUrl,
      createdAt: g.createdAt.toISOString(),
      status: deriveGuildStatus(g),
      memberCount: g._count.members,
      subscription: g.subscriptions[0]
        ? { status: g.subscriptions[0].status, planName: g.subscriptions[0].plan.name }
        : null,
    })),
    pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) },
  };
}

export async function getGuildDetail(guildId: string) {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: {
      members: {
        include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } },
        orderBy: { joinedAt: "asc" },
      },
      subscriptions: {
        include: { plan: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      _count: { select: { members: true, bossSchedules: true, lootSales: true, activities: true } },
    },
  });
  if (!guild) throw new NotFoundError("Guild not found");

  // A guild whose leader created a faction has a FACTION_LEADER member
  // instead of a GUILD_LEADER one — they remain the guild's owner.
  const owner =
    guild.members.find((m) => m.role === "GUILD_LEADER") ||
    guild.members.find((m) => m.role === "FACTION_LEADER") ||
    null;

  return {
    id: guild.id,
    name: guild.name,
    slug: guild.slug,
    description: guild.description,
    avatarUrl: guild.avatarUrl,
    createdAt: guild.createdAt.toISOString(),
    status: deriveGuildStatus(guild),
    counts: {
      members: guild._count.members,
      bossSchedules: guild._count.bossSchedules,
      lootSales: guild._count.lootSales,
      activities: guild._count.activities,
    },
    owner: owner
      ? { memberId: owner.id, userId: owner.user.id, displayName: owner.user.displayName, email: owner.user.email }
      : null,
    members: guild.members.map((m) => ({
      memberId: m.id,
      userId: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      rankName: m.rankName,
      isActive: m.isActive,
    })),
    subscriptions: guild.subscriptions.map((s) => ({
      id: s.id,
      status: s.status,
      planName: s.plan.name,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
    })),
  };
}

export type GuildModerationAction = "suspend" | "unsuspend" | "soft_delete" | "restore";

export async function moderateGuild(
  actorId: string,
  guildId: string,
  action: GuildModerationAction,
  reason?: string,
) {
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { name: true } });
  if (!guild) throw new NotFoundError("Guild not found");

  const data: Record<string, unknown> = {};
  switch (action) {
    case "suspend":
      data["suspendedAt"] = new Date();
      data["isActive"] = false;
      break;
    case "unsuspend":
      data["suspendedAt"] = null;
      data["isActive"] = true;
      break;
    case "soft_delete":
      data["deletedAt"] = new Date();
      data["isActive"] = false;
      break;
    case "restore":
      data["deletedAt"] = null;
      data["suspendedAt"] = null;
      data["isActive"] = true;
      break;
    default:
      throw new BadRequestError("Unknown moderation action");
  }

  await prisma.guild.update({ where: { id: guildId }, data });
  await writeAuditLog({
    actorId,
    guildId,
    action: `ADMIN_GUILD_${action.toUpperCase()}`,
    target: "Guild",
    targetId: guildId,
    detail: { name: guild.name, reason },
  });
  return { id: guildId, action };
}

/** Transfer guild leadership: promote target member to GUILD_LEADER, demote current leader to OFFICER. */
export async function transferGuildOwnership(actorId: string, guildId: string, newMemberId: string) {
  const [guild, newMember] = await Promise.all([
    prisma.guild.findUnique({ where: { id: guildId }, select: { name: true } }),
    prisma.guildMember.findUnique({ where: { id: newMemberId } }),
  ]);
  if (!guild) throw new NotFoundError("Guild not found");
  if (!newMember || newMember.guildId !== guildId) {
    throw new BadRequestError("Target member is not in this guild");
  }

  const currentLeaders = await prisma.guildMember.findMany({
    where: { guildId, role: "GUILD_LEADER" },
    select: { id: true },
  });

  await prisma.$transaction([
    // GUILD_LEADER/OFFICER are never valid custom-role bands, so both the
    // demoted leader(s) and the promoted member must have any stale custom
    // role reference cleared here too.
    ...currentLeaders.map((l) =>
      prisma.guildMember.update({
        where: { id: l.id },
        data: { role: "OFFICER", rankName: "Officer", customRoleId: null },
      }),
    ),
    prisma.guildMember.update({
      where: { id: newMemberId },
      data: { role: "GUILD_LEADER", rankName: "Guild Leader", customRoleId: null },
    }),
  ]);

  await writeAuditLog({
    actorId,
    guildId,
    action: "ADMIN_GUILD_TRANSFER_OWNERSHIP",
    target: "Guild",
    targetId: guildId,
    detail: { name: guild.name, newMemberId },
  });
  return { guildId, newLeaderId: newMemberId };
}

import { prisma } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { AUDIT_ACTIONS, canManageRole, type GuildRoleType } from "@guild/shared";
import { ForbiddenError, NotFoundError } from "../utils/errors";

// ─── Member Types ───────────────────────────────

export interface GuildMemberWithUser {
  id: string;
  userId: string;
  role: string;
  rankName: string;
  ign: string | null;
  cp: number | null;
  class: string | null;
  weapon: string | null;
  memberCode: string | null;
  joinedAt: string;
  isActive: boolean;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
}

// ─── Get Guild Members ──────────────────────────

export async function getGuildMembers(
  guildId: string,
): Promise<GuildMemberWithUser[]> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!guild) {
    throw new NotFoundError("Guild not found");
  }

  const members = await prisma.guildMember.findMany({
    where: {
      guildId,
      isActive: true,
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
    orderBy: [
      { role: "asc" }, // Higher roles first (enum order in Prisma)
      { joinedAt: "asc" },
    ],
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    rankName: m.rankName,
    ign: m.ign,
    cp: m.cp,
    class: m.class,
    weapon: m.weapon,
    memberCode: m.memberCode,
    joinedAt: m.joinedAt.toISOString(),
    isActive: m.isActive,
    user: {
      id: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
    },
  }));
}

// ─── Update Member Role ─────────────────────────

export async function updateMemberRole(
  guildId: string,
  memberId: string,
  newRole: GuildRoleType,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<GuildMemberWithUser> {
  // Get the actor's membership in this guild
  const actorMembership = await prisma.guildMember.findUnique({
    where: {
      userId_guildId: {
        userId: actorId,
        guildId,
      },
    },
  });

  if (!actorMembership || !actorMembership.isActive) {
    throw new ForbiddenError("You are not a member of this guild");
  }

  // Only GUILD_LEADER can manage roles
  if (actorMembership.role !== "GUILD_LEADER") {
    throw new ForbiddenError("Only Guild Leaders can manage roles");
  }

  // Get the target member
  const targetMember = await prisma.guildMember.findUnique({
    where: { id: memberId },
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

  if (!targetMember || targetMember.guildId !== guildId) {
    throw new NotFoundError("Member not found in this guild");
  }

  const oldRole = targetMember.role;

  // Handle GUILD_LEADER transfer: promoting someone to GL means the actor demotes themselves
  if (newRole === "GUILD_LEADER") {
    if (targetMember.userId === actorId) {
      throw new ForbiddenError("You are already the Guild Leader");
    }

    // Transfer: promote target to GL, demote actor to OFFICER
    const [updatedTarget] = await prisma.$transaction([
      prisma.guildMember.update({
        where: { id: memberId },
        data: { role: "GUILD_LEADER", rankName: "Guild Leader" },
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
      }),
      prisma.guildMember.update({
        where: { id: actorMembership.id },
        data: { role: "OFFICER", rankName: "Officer" },
      }),
    ]);

    // Audit: record both the promotion and self-demotion
    await writeAuditLog({
      actorId,
      guildId,
      action: AUDIT_ACTIONS.MEMBER_PROMOTED,
      target: "GuildMember",
      targetId: targetMember.userId,
      detail: {
        oldRole,
        newRole: "GUILD_LEADER",
        displayName: targetMember.user.displayName,
        transferredLeadership: true,
      },
      ipAddress,
      userAgent,
    });

    await writeAuditLog({
      actorId,
      guildId,
      action: AUDIT_ACTIONS.MEMBER_DEMOTED,
      target: "GuildMember",
      targetId: actorId,
      detail: {
        oldRole: "GUILD_LEADER",
        newRole: "OFFICER",
        selfDemotion: true,
        transferredTo: targetMember.user.displayName,
      },
      ipAddress,
      userAgent,
    });

    return {
      id: updatedTarget.id,
      userId: updatedTarget.userId,
      role: updatedTarget.role,
      rankName: updatedTarget.rankName,
      ign: updatedTarget.ign,
      cp: updatedTarget.cp,
      class: updatedTarget.class,
      weapon: updatedTarget.weapon,
      memberCode: updatedTarget.memberCode,
      joinedAt: updatedTarget.joinedAt.toISOString(),
      isActive: updatedTarget.isActive,
      user: updatedTarget.user,
    };
  }

  // Normal role change: GL can change any member's role (except to GL — handled above)
  if (!canManageRole(actorMembership.role as GuildRoleType, targetMember.role as GuildRoleType)) {
    throw new ForbiddenError(
      `Cannot change role of a ${targetMember.role}`,
    );
  }

  // Determine rank name based on role
  const rankNameMap: Record<string, string> = {
    ADMIN: "Admin",
    ALLIANCE_LEADER: "Alliance Leader",
    GUILD_LEADER: "Guild Leader",
    OFFICER: "Officer",
    CORE_MEMBER: "Core",
    ELITE_MEMBER: "Higher Rank",
    MEMBER: "Lower Rank",
  };

  const updated = await prisma.guildMember.update({
    where: { id: memberId },
    data: {
      role: newRole,
      rankName: rankNameMap[newRole] || "Lower Rank",
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
  });

  // Determine if promotion or demotion
  const isPromotion =
    ["MEMBER", "ELITE_MEMBER", "CORE_MEMBER", "OFFICER", "GUILD_LEADER", "ALLIANCE_LEADER", "ADMIN"].indexOf(newRole) >
    ["MEMBER", "ELITE_MEMBER", "CORE_MEMBER", "OFFICER", "GUILD_LEADER", "ALLIANCE_LEADER", "ADMIN"].indexOf(oldRole);

  await writeAuditLog({
    actorId,
    guildId,
    action: isPromotion ? AUDIT_ACTIONS.MEMBER_PROMOTED : AUDIT_ACTIONS.MEMBER_DEMOTED,
    target: "GuildMember",
    targetId: targetMember.userId,
    detail: {
      oldRole,
      newRole,
      displayName: targetMember.user.displayName,
    },
    ipAddress,
    userAgent,
  });

  return {
    id: updated.id,
    userId: updated.userId,
    role: updated.role,
    rankName: updated.rankName,
    ign: updated.ign,
    cp: updated.cp,
    class: updated.class,
    weapon: updated.weapon,
    memberCode: updated.memberCode,
    joinedAt: updated.joinedAt.toISOString(),
    isActive: updated.isActive,
    user: updated.user,
  };
}

export async function getGuildSettings(guildId: string) {
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
  });
  if (!settings) {
    throw new NotFoundError("Guild settings not found");
  }
  return settings;
}

export async function updateGuildSettings(
  guildId: string,
  payload: {
    taxRatePercent?: number;
    attendancePoints?: number;
    bossKillPoints?: number;
    rankMultipliers?: Record<string, number>;
    activeShareModel?: string;
    currencyCode?: string;
    currencySymbol?: string;
    secondaryCurrencyCode?: string | null;
    secondaryCurrencySymbol?: string | null;
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

  if (!actorMembership || !actorMembership.isActive || (actorMembership.role !== "GUILD_LEADER" && actorMembership.role !== "OFFICER" && actorMembership.role !== "ALLIANCE_LEADER" && actorMembership.role !== "ADMIN")) {
    throw new ForbiddenError("Only Guild Leaders and Officers can update settings");
  }

  const updated = await prisma.guildSettings.update({
    where: { guildId },
    data: {
      taxRatePercent: payload.taxRatePercent,
      attendancePoints: payload.attendancePoints,
      bossKillPoints: payload.bossKillPoints,
      rankMultipliers: payload.rankMultipliers || undefined,
      activeShareModel: payload.activeShareModel,
      currencyCode: payload.currencyCode,
      currencySymbol: payload.currencySymbol,
      secondaryCurrencyCode: payload.secondaryCurrencyCode,
      secondaryCurrencySymbol: payload.secondaryCurrencySymbol,
    },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: "GUILD_SETTINGS_UPDATED",
    target: "GuildSettings",
    targetId: updated.id,
    detail: { ...payload },
    ipAddress,
    userAgent,
  });

  return updated;
}

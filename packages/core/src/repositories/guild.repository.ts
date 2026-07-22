import { prisma, type Guild, type GuildMember, type GuildSettings } from "@guild/db";
import { type GuildRoleType } from "@guild/shared";
import { findGuildSettingsByGuildId, updateGuildSettingsByGuildId } from "../lib/guild-settings-schema";

const CUSTOM_ROLE_SELECT = { id: true, name: true, color: true, band: true } as const;

export interface IGuildRepository {
  getGuildById(guildId: string): Promise<Guild | null>;
  getMembers(guildId: string): Promise<any[]>;
  getMemberByUser(userId: string, guildId: string): Promise<GuildMember | null>;
  getMemberById(memberId: string): Promise<any | null>;
  deactivateMember(memberId: string): Promise<GuildMember>;
  updateMemberRole(
    memberId: string,
    role: GuildRoleType,
    rankName: string,
    customRoleId?: string | null,
  ): Promise<any>;
  transferLeadership(
    guildId: string,
    targetMemberId: string,
    actorMemberId: string,
    targetRole: GuildRoleType,
    targetRankName: string,
    actorRole: GuildRoleType,
    actorRankName: string,
  ): Promise<[any, any]>;
  getActiveGuildLeader(guildId: string): Promise<GuildMember | null>;
  getSettings(guildId: string): Promise<GuildSettings | null>;
  updateSettings(guildId: string, data: any): Promise<GuildSettings>;
  getInviteCode(guildId: string): Promise<string | null>;
  getRoleDefinition(
    guildId: string,
    roleId: string,
  ): Promise<{ id: string; name: string; color: string; band: string } | null>;
}

export class PrismaGuildRepository implements IGuildRepository {
  async getGuildById(guildId: string): Promise<Guild | null> {
    return prisma.guild.findUnique({
      where: { id: guildId },
    });
  }

  async getMembers(guildId: string): Promise<any[]> {
    return prisma.guildMember.findMany({
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
            bannerUrl: true,
          },
        },
        customRole: { select: CUSTOM_ROLE_SELECT },
      },
      orderBy: [
        { role: "asc" },
        { joinedAt: "asc" },
      ],
    });
  }

  async getMemberByUser(userId: string, guildId: string): Promise<GuildMember | null> {
    return prisma.guildMember.findUnique({
      where: {
        userId_guildId: {
          userId,
          guildId,
        },
      },
    });
  }

  async getMemberById(memberId: string): Promise<any | null> {
    return prisma.guildMember.findUnique({
      where: { id: memberId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
            bannerUrl: true,
          },
        },
        customRole: { select: CUSTOM_ROLE_SELECT },
      },
    });
  }

  async deactivateMember(memberId: string): Promise<GuildMember> {
    return prisma.guildMember.update({
      where: { id: memberId },
      data: { isActive: false },
    });
  }

  async updateMemberRole(
    memberId: string,
    role: GuildRoleType,
    rankName: string,
    customRoleId?: string | null,
  ): Promise<any> {
    return prisma.guildMember.update({
      where: { id: memberId },
      data: {
        role: role as any,
        rankName,
        customRoleId: customRoleId ?? null,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
            bannerUrl: true,
          },
        },
        customRole: { select: CUSTOM_ROLE_SELECT },
      },
    });
  }

  async transferLeadership(
    guildId: string,
    targetMemberId: string,
    actorMemberId: string,
    targetRole: GuildRoleType,
    targetRankName: string,
    actorRole: GuildRoleType,
    actorRankName: string,
  ): Promise<[any, any]> {
    return prisma.$transaction([
      prisma.guildMember.update({
        where: { id: targetMemberId },
        // GUILD_LEADER is never a valid custom-role band, so a promoted
        // target can never keep a stale custom role reference.
        data: { role: targetRole as any, rankName: targetRankName, customRoleId: null },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
              bannerUrl: true,
            },
          },
        },
      }),
      prisma.guildMember.update({
        where: { id: actorMemberId },
        // Demoted actor reverts to a plain rank, not whatever custom role
        // they may have held before becoming Guild Leader.
        data: { role: actorRole as any, rankName: actorRankName, customRoleId: null },
      }),
    ]);
  }

  async getActiveGuildLeader(guildId: string): Promise<GuildMember | null> {
    return prisma.guildMember.findFirst({
      where: { guildId, role: "GUILD_LEADER", isActive: true },
    });
  }

  async getSettings(guildId: string): Promise<GuildSettings | null> {
    return findGuildSettingsByGuildId(guildId);
  }

  async updateSettings(guildId: string, data: any): Promise<GuildSettings> {
    return updateGuildSettingsByGuildId(guildId, data);
  }

  async getInviteCode(guildId: string): Promise<string | null> {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { inviteCode: true },
    });
    return guild?.inviteCode || null;
  }

  async getRoleDefinition(
    guildId: string,
    roleId: string,
  ): Promise<{ id: string; name: string; color: string; band: string } | null> {
    const definition = await prisma.guildRoleDefinition.findUnique({ where: { id: roleId } });
    if (!definition || definition.guildId !== guildId) return null;
    return { id: definition.id, name: definition.name, color: definition.color, band: definition.band };
  }
}

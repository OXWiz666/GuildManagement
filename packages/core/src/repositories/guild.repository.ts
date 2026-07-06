import { prisma, type Guild, type GuildMember, type GuildSettings } from "@guild/db";
import { type GuildRoleType } from "@guild/shared";

export interface IGuildRepository {
  getGuildById(guildId: string): Promise<Guild | null>;
  getMembers(guildId: string): Promise<any[]>;
  getMemberByUser(userId: string, guildId: string): Promise<GuildMember | null>;
  getMemberById(memberId: string): Promise<any | null>;
  updateMemberRole(memberId: string, role: GuildRoleType, rankName: string): Promise<any>;
  transferLeadership(
    guildId: string,
    targetMemberId: string,
    actorMemberId: string,
    targetRole: GuildRoleType,
    targetRankName: string,
    actorRole: GuildRoleType,
    actorRankName: string,
  ): Promise<[any, any]>;
  getSettings(guildId: string): Promise<GuildSettings | null>;
  updateSettings(guildId: string, data: any): Promise<GuildSettings>;
  getInviteCode(guildId: string): Promise<string | null>;
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
          },
        },
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
          },
        },
      },
    });
  }

  async updateMemberRole(memberId: string, role: GuildRoleType, rankName: string): Promise<any> {
    return prisma.guildMember.update({
      where: { id: memberId },
      data: {
        role: role as any,
        rankName,
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
        data: { role: targetRole as any, rankName: targetRankName },
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
        where: { id: actorMemberId },
        data: { role: actorRole as any, rankName: actorRankName },
      }),
    ]);
  }

  async getSettings(guildId: string): Promise<GuildSettings | null> {
    return prisma.guildSettings.findUnique({
      where: { guildId },
    });
  }

  async updateSettings(guildId: string, data: any): Promise<GuildSettings> {
    return prisma.guildSettings.update({
      where: { guildId },
      data,
    });
  }

  async getInviteCode(guildId: string): Promise<string | null> {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { inviteCode: true },
    });
    return guild?.inviteCode || null;
  }
}

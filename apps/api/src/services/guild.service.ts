import { type GuildSettings, type GuildMember } from "@guild/db";
import { AUDIT_ACTIONS, canManageRole, type GuildRoleType } from "@guild/shared";
import { ForbiddenError, NotFoundError } from "../utils/errors";
import { IGuildRepository, PrismaGuildRepository } from "../repositories/guild.repository";
import { IAuditRepository, PrismaAuditRepository } from "../repositories/audit.repository";

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

export class GuildService {
  constructor(
    private guildRepo: IGuildRepository,
    private auditRepo: IAuditRepository,
  ) {}

  /**
   * Get members of a guild.
   */
  async getGuildMembers(guildId: string): Promise<GuildMemberWithUser[]> {
    const guild = await this.guildRepo.getGuildById(guildId);

    if (!guild) {
      throw new NotFoundError("Guild not found");
    }

    const members = await this.guildRepo.getMembers(guildId);

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

  /**
   * Update a member's role (promotion or demotion).
   */
  async updateMemberRole(
    guildId: string,
    memberId: string,
    newRole: GuildRoleType,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<GuildMemberWithUser> {
    // Get the actor's membership in this guild
    const actorMembership = await this.guildRepo.getMemberByUser(actorId, guildId);

    if (!actorMembership || !actorMembership.isActive) {
      throw new ForbiddenError("You are not a member of this guild");
    }

    // Only GUILD_LEADER can manage roles
    if (actorMembership.role !== "GUILD_LEADER") {
      throw new ForbiddenError("Only Guild Leaders can manage roles");
    }

    // Get the target member
    const targetMember = await this.guildRepo.getMemberById(memberId);

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
      const [updatedTarget] = await this.guildRepo.transferLeadership(
        guildId,
        memberId,
        actorMembership.id,
        "GUILD_LEADER",
        "Guild Leader",
        "OFFICER",
        "Officer",
      );

      // Audit: record both the promotion and self-demotion
      await this.auditRepo.create({
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

      await this.auditRepo.create({
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

    const updated = await this.guildRepo.updateMemberRole(
      memberId,
      newRole,
      rankNameMap[newRole] || "Lower Rank",
    );

    // Determine if promotion or demotion
    const isPromotion =
      ["MEMBER", "ELITE_MEMBER", "CORE_MEMBER", "OFFICER", "GUILD_LEADER", "ALLIANCE_LEADER", "ADMIN"].indexOf(newRole) >
      ["MEMBER", "ELITE_MEMBER", "CORE_MEMBER", "OFFICER", "GUILD_LEADER", "ALLIANCE_LEADER", "ADMIN"].indexOf(oldRole);

    await this.auditRepo.create({
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

  /**
   * Get guild settings.
   */
  async getGuildSettings(guildId: string): Promise<GuildSettings> {
    const settings = await this.guildRepo.getSettings(guildId);
    if (!settings) {
      throw new NotFoundError("Guild settings not found");
    }
    return settings;
  }

  /**
   * Update guild settings.
   */
  async updateGuildSettings(
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
  ): Promise<GuildSettings> {
    // Validate actor is Guild Leader, Officer, or Faction Leader
    const actorMembership = await this.guildRepo.getMemberByUser(actorId, guildId);

    if (
      !actorMembership ||
      !actorMembership.isActive ||
      (actorMembership.role !== "GUILD_LEADER" &&
        actorMembership.role !== "OFFICER" &&
        actorMembership.role !== "ALLIANCE_LEADER" &&
        actorMembership.role !== "ADMIN")
    ) {
      throw new ForbiddenError("Only Guild Leaders and Officers can update settings");
    }

    const updated = await this.guildRepo.updateSettings(guildId, {
      taxRatePercent: payload.taxRatePercent,
      attendancePoints: payload.attendancePoints,
      bossKillPoints: payload.bossKillPoints,
      rankMultipliers: payload.rankMultipliers || undefined,
      activeShareModel: payload.activeShareModel,
      currencyCode: payload.currencyCode,
      currencySymbol: payload.currencySymbol,
      secondaryCurrencyCode: payload.secondaryCurrencyCode,
      secondaryCurrencySymbol: payload.secondaryCurrencySymbol,
    });

    await this.auditRepo.create({
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

  /**
   * Get member context helper (used in RBAC middleware to bypass direct DB imports).
   */
  async getGuildMemberByUser(userId: string, guildId: string): Promise<GuildMember | null> {
    return this.guildRepo.getMemberByUser(userId, guildId);
  }

  /**
   * Get invite code helper (used in router to bypass direct DB imports).
   */
  async getGuildInviteCode(guildId: string): Promise<string | null> {
    return this.guildRepo.getInviteCode(guildId);
  }
}

// Runtime concrete singleton
const prismaGuildRepo = new PrismaGuildRepository();
const prismaAuditRepo = new PrismaAuditRepository();
export const guildService = new GuildService(prismaGuildRepo, prismaAuditRepo);

// Backward-compatible exports
export const getGuildMembers = (guildId: string): Promise<GuildMemberWithUser[]> =>
  guildService.getGuildMembers(guildId);

export const updateMemberRole = (
  guildId: string,
  memberId: string,
  newRole: GuildRoleType,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<GuildMemberWithUser> =>
  guildService.updateMemberRole(guildId, memberId, newRole, actorId, ipAddress, userAgent);

export const getGuildSettings = (guildId: string): Promise<GuildSettings> =>
  guildService.getGuildSettings(guildId);

export const updateGuildSettings = (
  guildId: string,
  payload: any,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<GuildSettings> =>
  guildService.updateGuildSettings(guildId, payload, actorId, ipAddress, userAgent);

export const getGuildMemberByUser = (userId: string, guildId: string): Promise<GuildMember | null> =>
  guildService.getGuildMemberByUser(userId, guildId);

export const getGuildInviteCode = (guildId: string): Promise<string | null> =>
  guildService.getGuildInviteCode(guildId);

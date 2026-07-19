import * as crypto from "crypto";
import { prisma, Prisma, SubscriptionStatus, type GuildSettings, type GuildMember } from "@guild/db";
import {
  AUDIT_ACTIONS,
  canManageRole,
  hasMinimumRole,
  orgNameSchema,
  resolveRoleDisplayName,
  slugify,
  CUSTOMIZABLE_ROLES,
  type GuildRoleType,
} from "@guild/shared";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { cache } from "../lib/cache";
import { broadcastToGuild } from "../lib/socket";
import { IGuildRepository, PrismaGuildRepository } from "../repositories/guild.repository";
import { IAuditRepository, PrismaAuditRepository } from "../repositories/audit.repository";

// Per-request RBAC resolves the caller's guild membership. Against a remote
// (transaction-pooled) Postgres this single read costs several network round
// trips, and it runs on the majority of guarded endpoints, so cache it briefly.
// Role changes invalidate the affected keys explicitly (see updateMemberRole);
// worst-case staleness is bounded by this TTL.
const MEMBERSHIP_CACHE_TTL = 15; // seconds
const membershipCacheKey = (guildId: string, userId: string) =>
  `membership:${guildId}:${userId}`;
const SELF_LEAVE_BLOCKED_ROLES = new Set(["GUILD_LEADER", "FACTION_LEADER"]);
const ACTIVE_SUBSCRIPTION_STATES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];
const FREE_GUILD_RENAME_LIMIT = 1;
const GUILD_PROFILE_INCLUDE = {
  subscriptions: {
    where: { status: { in: ACTIVE_SUBSCRIPTION_STATES } },
    orderBy: [{ currentPeriodEnd: "desc" }, { createdAt: "desc" }],
    take: 1,
    select: { status: true, plan: { select: { name: true } } },
  },
} satisfies Prisma.GuildInclude;

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
  customRole: { id: string; name: string; color: string; band: string } | null;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
  };
}

export interface GuildProfile {
  id: string;
  name: string;
  slug: string;
  nameChangeCount: number;
  nameChangeLimit: number | null;
  remainingNameChanges: number | null;
  canRename: boolean;
  isSubscribed: boolean;
  subscriptionStatus: string | null;
  planName: string | null;
}

function toGuildProfile(guild: {
  id: string;
  name: string;
  slug: string;
  nameChangeCount: number;
  subscriptions: Array<{ status: string; plan: { name: string } }>;
}): GuildProfile {
  const activeSubscription = guild.subscriptions[0] ?? null;
  const isSubscribed = Boolean(activeSubscription);
  const remaining = isSubscribed ? null : Math.max(0, FREE_GUILD_RENAME_LIMIT - guild.nameChangeCount);

  return {
    id: guild.id,
    name: guild.name,
    slug: guild.slug,
    nameChangeCount: guild.nameChangeCount,
    nameChangeLimit: isSubscribed ? null : FREE_GUILD_RENAME_LIMIT,
    remainingNameChanges: remaining,
    canRename: isSubscribed || (remaining ?? 0) > 0,
    isSubscribed,
    subscriptionStatus: activeSubscription?.status ?? null,
    planName: activeSubscription?.plan.name ?? null,
  };
}

async function uniqueGuildSlug(name: string, guildId: string): Promise<string> {
  const base = slugify(name) || "guild";

  const isTaken = async (slug: string) =>
    Boolean(await prisma.guild.findFirst({ where: { slug, NOT: { id: guildId } }, select: { id: true } }));

  if (!(await isTaken(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${crypto.randomBytes(2).toString("hex")}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
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
    // The guild-existence check and the member fetch are independent — run them
    // concurrently so the existence guard doesn't add a serial round trip.
    const [guild, members] = await Promise.all([
      this.guildRepo.getGuildById(guildId),
      this.guildRepo.getMembers(guildId),
    ]);

    if (!guild) {
      throw new NotFoundError("Guild not found");
    }

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
      customRole: m.customRole
        ? { id: m.customRole.id, name: m.customRole.name, color: m.customRole.color, band: m.customRole.band }
        : null,
      user: {
        id: m.user.id,
        displayName: m.user.displayName,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        bannerUrl: m.user.bannerUrl,
      },
    }));
  }

  /**
   * Update a member's role (promotion or demotion), or assign/clear a
   * guild-defined custom role (which always carries a fixed permission
   * "band" — see GuildRoleDefinition). Exactly one of `role`/`customRoleId`
   * drives the change; the other is derived.
   */
  async updateMemberRole(
    guildId: string,
    memberId: string,
    input: { role?: GuildRoleType; customRoleId?: string | null },
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<GuildMemberWithUser> {
    // Get the actor's membership in this guild
    const actorMembership = await this.guildRepo.getMemberByUser(actorId, guildId);

    if (!actorMembership || !actorMembership.isActive) {
      throw new ForbiddenError("You are not a member of this guild");
    }

    // Guild Leaders and above can manage guild roles. This must match the
    // route guard's role hierarchy, otherwise Faction Leaders pass middleware
    // but fail here with a confusing ForbiddenError.
    if (!hasMinimumRole(actorMembership.role as GuildRoleType, "GUILD_LEADER")) {
      throw new ForbiddenError("Only Guild Leaders can manage roles");
    }

    // Get the target member and the guild's role-label overrides
    const [targetMember, settings] = await Promise.all([
      this.guildRepo.getMemberById(memberId),
      this.guildRepo.getSettings(guildId),
    ]);
    const roleDisplayNames = (settings?.roleDisplayNames || null) as Partial<
      Record<GuildRoleType, string>
    > | null;

    if (!targetMember || targetMember.guildId !== guildId) {
      throw new NotFoundError("Member not found in this guild");
    }

    // Resolve the effective (band) role, display name, and custom-role FK
    // from the caller's input. A custom role always wins over a literal
    // `role` if both are somehow present.
    let newRole: GuildRoleType;
    let newRankName: string;
    let newCustomRoleId: string | null;
    let newCustomRoleName: string | null = null;

    if (input.customRoleId) {
      const definition = await this.guildRepo.getRoleDefinition(guildId, input.customRoleId);
      if (!definition) {
        throw new NotFoundError("Custom role not found in this guild");
      }
      newRole = definition.band as GuildRoleType;
      newRankName = definition.name;
      newCustomRoleId = definition.id;
      newCustomRoleName = definition.name;
    } else if (input.role) {
      newRole = input.role;
      newRankName = resolveRoleDisplayName(newRole, roleDisplayNames);
      newCustomRoleId = null;
    } else {
      throw new BadRequestError("Either role or customRoleId must be provided");
    }

    const oldRole = targetMember.role;
    const oldRankName: string = targetMember.customRole?.name ?? resolveRoleDisplayName(oldRole, roleDisplayNames);

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
        resolveRoleDisplayName("GUILD_LEADER", roleDisplayNames),
        "OFFICER",
        resolveRoleDisplayName("OFFICER", roleDisplayNames),
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

      // Both the promoted target and the demoted actor changed role — drop their
      // cached membership so RBAC reflects the new roles immediately.
      await Promise.all([
        cache.delete(membershipCacheKey(guildId, targetMember.userId)),
        cache.delete(membershipCacheKey(guildId, actorId)),
      ]);

      await broadcastToGuild(guildId, "member_role_updated", {
        userId: targetMember.userId,
        oldRole,
        newRole: "GUILD_LEADER",
      });
      await broadcastToGuild(guildId, "member_role_updated", {
        userId: actorId,
        oldRole: "GUILD_LEADER",
        newRole: "OFFICER",
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
        customRole: null,
        user: updatedTarget.user,
      };
    }

    // Normal role change: GL can change any member's role (except to GL — handled above)
    if (!canManageRole(actorMembership.role as GuildRoleType, targetMember.role as GuildRoleType)) {
      throw new ForbiddenError(
        `Cannot change role of a ${targetMember.role}`,
      );
    }

    const updated = await this.guildRepo.updateMemberRole(memberId, newRole, newRankName, newCustomRoleId);

    // A band change (oldRole !== newRole) is a real promotion/demotion. When
    // the band is unchanged — e.g. assigning/clearing a custom role that
    // shares the member's current band — log a neutral action instead of
    // misreporting it as a demotion (index compare is equal, not ">").
    const bandChanged = oldRole !== newRole;
    const isPromotion =
      bandChanged &&
      ["MEMBER", "ELITE_MEMBER", "CORE_MEMBER", "OFFICER", "GUILD_LEADER", "FACTION_LEADER", "ADMIN"].indexOf(newRole) >
      ["MEMBER", "ELITE_MEMBER", "CORE_MEMBER", "OFFICER", "GUILD_LEADER", "FACTION_LEADER", "ADMIN"].indexOf(oldRole);

    await this.auditRepo.create({
      actorId,
      guildId,
      action: bandChanged
        ? (isPromotion ? AUDIT_ACTIONS.MEMBER_PROMOTED : AUDIT_ACTIONS.MEMBER_DEMOTED)
        : AUDIT_ACTIONS.MEMBER_ROLE_CUSTOMIZED,
      target: "GuildMember",
      targetId: targetMember.userId,
      detail: {
        oldRole,
        newRole,
        oldRoleName: oldRankName,
        newRoleName: newCustomRoleName ?? newRankName,
        displayName: targetMember.user.displayName,
      },
      ipAddress,
      userAgent,
    });

    // Invalidate the target's cached membership so the new role takes effect now.
    await cache.delete(membershipCacheKey(guildId, targetMember.userId));

    // Announce the change to realtime subscribers. The Discord bot caches
    // (discordId, guildId) → role and has no other way to learn a role changed
    // here, so without this its permission gate stays stale until its TTL
    // lapses. Fire-and-forget: broadcastToGuild swallows its own errors, and a
    // realtime hiccup must never fail a promotion.
    await broadcastToGuild(guildId, "member_role_updated", {
      userId: targetMember.userId,
      oldRole,
      newRole,
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
      customRole: updated.customRole
        ? { id: updated.customRole.id, name: updated.customRole.name, color: updated.customRole.color, band: updated.customRole.band }
        : null,
      user: updated.user,
    };
  }

  /**
   * Let an active member leave a guild without deleting historical records.
   * Leadership transfer is required first so the guild is never orphaned.
   */
  async leaveGuild(
    guildId: string,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: true; guildId: string }> {
    const membership = await this.guildRepo.getMemberByUser(actorId, guildId);

    if (!membership || !membership.isActive) {
      throw new ForbiddenError("You are not an active member of this guild");
    }

    if (SELF_LEAVE_BLOCKED_ROLES.has(membership.role)) {
      throw new BadRequestError("Transfer guild leadership before leaving this guild");
    }

    await this.guildRepo.deactivateMember(membership.id);

    await this.auditRepo.create({
      actorId,
      guildId,
      action: "GUILD_MEMBER_LEFT",
      target: "GuildMember",
      targetId: membership.id,
      detail: {
        userId: actorId,
        role: membership.role,
        rankName: membership.rankName,
      },
      ipAddress,
      userAgent,
    });

    await cache.delete(membershipCacheKey(guildId, actorId));

    return { success: true, guildId };
  }

  /**
   * Guild profile metadata that belongs to the Guild row, not GuildSettings.
   */
  async getGuildProfile(guildId: string, actorId: string): Promise<GuildProfile> {
    const [membership, guild] = await Promise.all([
      this.guildRepo.getMemberByUser(actorId, guildId),
      prisma.guild.findUnique({
        where: { id: guildId },
        include: GUILD_PROFILE_INCLUDE,
      }),
    ]);

    if (!membership || !membership.isActive) {
      throw new ForbiddenError("You must be an active member of this guild");
    }
    if (!guild) throw new NotFoundError("Guild not found");

    return toGuildProfile(guild);
  }

  /**
   * Rename a guild. Free guilds can rename once; active subscriptions remove
   * the quota. Only leaders/faction leaders/admins can rename the guild.
   */
  async renameGuild(
    guildId: string,
    rawName: string,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<GuildProfile> {
    const actorMembership = await this.guildRepo.getMemberByUser(actorId, guildId);

    if (
      !actorMembership ||
      !actorMembership.isActive ||
      !["GUILD_LEADER", "FACTION_LEADER", "ADMIN"].includes(actorMembership.role)
    ) {
      throw new ForbiddenError("Only Guild Leaders can rename the guild");
    }

    const parsedName = orgNameSchema.safeParse(rawName);
    if (!parsedName.success) {
      throw new ValidationError(parsedName.error.issues[0]?.message || "Invalid guild name", parsedName.error.flatten());
    }
    const newName = parsedName.data;

    try {
      const { updated, auditDetail } = await prisma.$transaction(async (tx) => {
        const guild = await tx.guild.findUnique({
          where: { id: guildId },
          include: GUILD_PROFILE_INCLUDE,
        });

        if (!guild) throw new NotFoundError("Guild not found");
        if (guild.name === newName) return { updated: guild, auditDetail: null };

        const isSubscribed = guild.subscriptions.length > 0;
        if (!isSubscribed && guild.nameChangeCount >= FREE_GUILD_RENAME_LIMIT) {
          throw new ForbiddenError("Free guilds can change their name only once. Subscribe for unlimited guild renames.");
        }

        const newSlug = await uniqueGuildSlug(newName, guildId);

        if (!isSubscribed) {
          const result = await tx.guild.updateMany({
            where: { id: guildId, nameChangeCount: { lt: FREE_GUILD_RENAME_LIMIT } },
            data: { name: newName, slug: newSlug, nameChangeCount: { increment: 1 } },
          });

          if (result.count === 0) {
            throw new ForbiddenError("Free guilds can change their name only once. Subscribe for unlimited guild renames.");
          }
        } else {
          await tx.guild.update({
            where: { id: guildId },
            data: { name: newName, slug: newSlug, nameChangeCount: { increment: 1 } },
          });
        }

        const renamed = await tx.guild.findUnique({
          where: { id: guildId },
          include: GUILD_PROFILE_INCLUDE,
        });
        if (!renamed) throw new NotFoundError("Guild not found");

        return {
          updated: renamed,
          auditDetail: {
            field: "name",
            oldName: guild.name,
            newName,
            oldSlug: guild.slug,
            newSlug,
            isSubscribed,
          },
        };
      });

      if (auditDetail) {
        await this.auditRepo.create({
          actorId,
          guildId,
          action: AUDIT_ACTIONS.GUILD_UPDATED,
          target: "Guild",
          targetId: guildId,
          detail: auditDetail,
          ipAddress,
          userAgent,
        });
      }

      await Promise.all([
        cache.delete(`guild-settings:${guildId}`),
        cache.delete(`guild-members:${guildId}`),
      ]);

      return toGuildProfile(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("A guild with this name already exists. Try a slightly different name.");
      }
      throw error;
    }
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
      serverName?: string | null;
      timezone?: string;
      region?: string | null;
      language?: string;
      settingsTemplateName?: string | null;
      currencyCode?: string;
      currencySymbol?: string;
      secondaryCurrencyCode?: string | null;
      secondaryCurrencySymbol?: string | null;
      pointsResetCycle?: string;
      roleDisplayNames?: Partial<Record<GuildRoleType, string>>;
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
        actorMembership.role !== "FACTION_LEADER" &&
        actorMembership.role !== "ADMIN")
    ) {
      throw new ForbiddenError("Only Guild Leaders and Officers can update settings");
    }

    const serverName = payload.serverName?.trim();
    const timezone = payload.timezone?.trim();
    const region = payload.region?.trim();
    const language = payload.language?.trim();
    const settingsTemplateName = payload.settingsTemplateName?.trim();
    if (serverName && serverName.length > 80) {
      throw new ValidationError("Server name must be 80 characters or fewer");
    }
    if (timezone !== undefined && (!timezone || timezone.length > 64)) {
      throw new ValidationError("Timezone is required and must be 64 characters or fewer");
    }
    if (region && region.length > 60) {
      throw new ValidationError("Region must be 60 characters or fewer");
    }
    if (language !== undefined && (!language || language.length > 12)) {
      throw new ValidationError("Language is required and must be 12 characters or fewer");
    }
    if (settingsTemplateName && settingsTemplateName.length > 64) {
      throw new ValidationError("Template name must be 64 characters or fewer");
    }

    let roleDisplayNames: Partial<Record<GuildRoleType, string>> | undefined;
    if (payload.roleDisplayNames) {
      roleDisplayNames = {};
      for (const role of CUSTOMIZABLE_ROLES) {
        const label = payload.roleDisplayNames[role];
        if (typeof label !== "string") continue;
        const trimmed = label.trim();
        if (!trimmed) continue;
        if (trimmed.length > 32) {
          throw new ValidationError(`Role name for ${role} must be 32 characters or fewer`);
        }
        roleDisplayNames[role] = trimmed;
      }
    }

    const updated = await this.guildRepo.updateSettings(guildId, {
      taxRatePercent: payload.taxRatePercent,
      attendancePoints: payload.attendancePoints,
      bossKillPoints: payload.bossKillPoints,
      rankMultipliers: payload.rankMultipliers || undefined,
      activeShareModel: payload.activeShareModel,
      serverName: payload.serverName === undefined ? undefined : serverName || null,
      timezone: payload.timezone === undefined ? undefined : timezone,
      region: payload.region === undefined ? undefined : region || null,
      language: payload.language === undefined ? undefined : language,
      settingsTemplateName: payload.settingsTemplateName === undefined ? undefined : settingsTemplateName || null,
      currencyCode: payload.currencyCode,
      currencySymbol: payload.currencySymbol,
      secondaryCurrencyCode: payload.secondaryCurrencyCode,
      secondaryCurrencySymbol: payload.secondaryCurrencySymbol,
      pointsResetCycle: payload.pointsResetCycle,
      roleDisplayNames,
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
    return cache.getOrSet(
      membershipCacheKey(guildId, userId),
      MEMBERSHIP_CACHE_TTL,
      () => this.guildRepo.getMemberByUser(userId, guildId),
    );
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
  input: { role?: GuildRoleType; customRoleId?: string | null },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<GuildMemberWithUser> =>
  guildService.updateMemberRole(guildId, memberId, input, actorId, ipAddress, userAgent);

export const leaveGuild = (
  guildId: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ success: true; guildId: string }> =>
  guildService.leaveGuild(guildId, actorId, ipAddress, userAgent);

export const getGuildProfile = (guildId: string, actorId: string): Promise<GuildProfile> =>
  guildService.getGuildProfile(guildId, actorId);

export const renameGuild = (
  guildId: string,
  name: string,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<GuildProfile> =>
  guildService.renameGuild(guildId, name, actorId, ipAddress, userAgent);

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

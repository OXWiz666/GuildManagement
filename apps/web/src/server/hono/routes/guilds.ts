import { Hono } from "hono";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import { prisma } from "@guild/db";
import { activityPointRulesSchema, gearItemsSchema, GUILD_ROLES, type GuildRoleType } from "@guild/shared";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { getClientInfo, readJson } from "../request";
import { zBody } from "../validation";
import { requireAuth, requireGuildRole } from "../middleware/auth";
import { auditLogLimit } from "../middleware/ratelimit";

function clampPagination(pageParam: string | null, limitParam: string | null, defaultLimit = 30) {
  const parsedPage = pageParam ? parseInt(pageParam, 10) : NaN;
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : defaultLimit;
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Guilds domain — Hono port of apps/web/src/app/api/guilds/**. Top-level static
 * routes (/invite/:code, /join, /join-requests/*) are registered before the
 * /:guildId/* routes; Hono gives static segments precedence over params, so
 * "invite" / "join" / "join-requests" are never captured as a guildId.
 */
export const guilds = new Hono<AppEnv>()
  // ─── Top-level (non-:guildId) routes ─────────────────────────
  .get("/invite/:code", requireAuth, async (c) => {
    const guild = await services.application.verifyInviteCode(c.req.param("code"));
    return ok(c, { guild });
  })
  .get("/join-requests/pending", requireAuth, async (c) => {
    const user = c.get("user");
    const request = await services.application.getUserPendingRequest(user.userId);
    return ok(c, { request });
  })
  .delete("/join-requests/:requestId", requireAuth, async (c) => {
    const user = c.get("user");
    const result = await services.application.cancelJoinRequest(user.userId, c.req.param("requestId"));
    broadcastToGuild(result.guildId, "join_request_cancelled", { requestId: c.req.param("requestId") });
    return ok(c, result);
  })
  .post("/join", requireAuth, async (c) => {
    const user = c.get("user");
    const body = await readJson<{ inviteCode: string; ign: string; cp: number; class: string; weapon: string; gear?: unknown }>(c);
    const gearItems = gearItemsSchema.parse(body.gear);
    const result = await services.application.createJoinRequest(
      user.userId, body.inviteCode, body.ign, Number(body.cp), body.class, body.weapon, gearItems,
    );
    const fullRequest = await prisma.guildJoinRequest.findUnique({
      where: { id: result.id },
      include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
    });
    if (fullRequest) {
      broadcastToGuild(result.guildId, "join_request_created", { ...fullRequest, createdAt: fullRequest.createdAt.toISOString() });
    }
    return ok(c, result);
  })

  // ─── Activity rules ──────────────────────────────────────────
  .get("/:guildId/activity-rules", requireGuildRole("MEMBER"), async (c) => {
    const rules = await services.activityPoints.getActivityPointRules(c.req.param("guildId"), c.get("user").userId);
    return ok(c, { rules });
  })
  .patch("/:guildId/activity-rules", requireGuildRole("OFFICER"), zBody(activityPointRulesSchema), async (c) => {
    const rules = await services.activityPoints.updateActivityPointRules(c.req.param("guildId"), c.get("user").userId, c.req.valid("json"));
    return ok(c, { rules });
  })

  // ─── Applications ────────────────────────────────────────────
  .get("/:guildId/applications", requireGuildRole("OFFICER"), async (c) => {
    const applications = await services.application.getGuildApplications(c.req.param("guildId"));
    return ok(c, { applications });
  })
  .patch("/:guildId/applications/:requestId", requireGuildRole("OFFICER"), async (c) => {
    const guildId = c.req.param("guildId");
    const requestId = c.req.param("requestId");
    const user = c.get("user");
    const { action } = await readJson<{ action?: "ACCEPT" | "DECLINE" }>(c);
    if (action !== "ACCEPT" && action !== "DECLINE") {
      throw new BadRequestError("Action must be ACCEPT or DECLINE");
    }
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.application.handleApplicationAction(guildId, requestId, action, user.userId, ipAddress, userAgent);
    broadcastToGuild(guildId, "join_request_processed", { requestId, action, memberCode: result.memberCode });
    return ok(c, result);
  })

  // ─── Audit logs ──────────────────────────────────────────────
  .get("/:guildId/audit-logs", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    auditLogLimit(c);
    const filter = c.req.query("filter") ?? undefined;
    const { page, limit, skip } = clampPagination(c.req.query("page") ?? null, c.req.query("limit") ?? null);

    if (filter === "items") {
      return ok(c, await services.auditLog.getItemDistributionAuditLogs(guildId, page, limit));
    }
    if (filter === "member-items") {
      const memberId = c.req.query("memberId");
      if (!memberId) throw new BadRequestError("memberId query parameter is required for member-items filter");
      return ok(c, await services.auditLog.getItemDistributionAuditLogs(guildId, page, limit, memberId));
    }
    if (filter === "currency") {
      return ok(c, await services.auditLog.getCurrencyDistributionAuditLogs(guildId, page, limit));
    }

    let actionFilter: Record<string, unknown> | undefined;
    if (filter === "boss-rotation") {
      actionFilter = { in: ["BOSS_ROTATION_QUEUE_UPDATED", "BOSS_ROTATION_KILLED"] };
    } else if (filter === "boss") {
      actionFilter = {
        in: [
          "BOSS_EVENT_SCHEDULED", "BOSS_KILLED_LOGGED", "BOSS_EVENT_UPDATED", "BOSS_EVENT_DELETED",
          "BOSS_KILL_RECORDED", "BOSS_ROTATION_QUEUE_UPDATED", "BOSS_ROTATION_KILLED",
        ],
      };
    }

    const where = { guildId, ...(actionFilter ? { action: actionFilter } : {}) };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return ok(c, {
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        target: log.target,
        targetId: log.targetId,
        detail: log.detail,
        createdAt: log.createdAt.toISOString(),
        actor: { id: log.actor.id, displayName: log.actor.displayName, avatarUrl: log.actor.avatarUrl },
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  })

  // ─── Custom roles ────────────────────────────────────────────
  .get("/:guildId/custom-roles", requireGuildRole("MEMBER"), async (c) => {
    const roles = await services.customRole.listCustomRoles(c.req.param("guildId"));
    return ok(c, { roles });
  })
  .post("/:guildId/custom-roles", requireGuildRole("GUILD_LEADER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const body = await readJson<{ name?: string; color?: string; band?: string }>(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    const role = await services.customRole.createCustomRole(user.userId, guildId, body, ipAddress, userAgent);
    broadcastToGuild(guildId, "custom_roles_updated", { guildId });
    return ok(c, { role });
  })
  .patch("/:guildId/custom-roles/:roleId", requireGuildRole("GUILD_LEADER"), async (c) => {
    const guildId = c.req.param("guildId");
    const roleId = c.req.param("roleId");
    const user = c.get("user");
    const body = await readJson<{ name?: string; color?: string; sortOrder?: number }>(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    const role = await services.customRole.updateCustomRole(user.userId, guildId, roleId, body, ipAddress, userAgent);
    broadcastToGuild(guildId, "custom_roles_updated", { guildId });
    broadcastToGuild(guildId, "member_role_updated", { guildId });
    return ok(c, { role });
  })
  .delete("/:guildId/custom-roles/:roleId", requireGuildRole("GUILD_LEADER"), async (c) => {
    const guildId = c.req.param("guildId");
    const roleId = c.req.param("roleId");
    const user = c.get("user");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.customRole.deleteCustomRole(user.userId, guildId, roleId, ipAddress, userAgent);
    broadcastToGuild(guildId, "custom_roles_updated", { guildId });
    broadcastToGuild(guildId, "member_role_updated", { guildId });
    return ok(c, result);
  })

  // ─── Invite code ─────────────────────────────────────────────
  .get("/:guildId/invite-code", requireGuildRole("OFFICER"), async (c) => {
    const inviteCode = await services.guild.getGuildInviteCode(c.req.param("guildId"));
    return ok(c, { inviteCode });
  })
  .post("/:guildId/invite-code", requireGuildRole("GUILD_LEADER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.application.generateGuildInviteCode(guildId, user.userId, ipAddress, userAgent);
    broadcastToGuild(guildId, "invite_code_updated", { inviteCode: result.inviteCode });
    return ok(c, result);
  })

  // ─── Faction join-requests for this guild ────────────────────
  .get("/:guildId/join-requests/faction", requireAuth, async (c) => {
    const user = c.get("user");
    const requests = await services.faction.listPendingForGuild(user.userId, c.req.param("guildId"));
    return ok(c, { requests });
  })

  // ─── Members ─────────────────────────────────────────────────
  .get("/:guildId/members", requireGuildRole("MEMBER"), async (c) => {
    return ok(c, { members: await services.guild.getGuildMembers(c.req.param("guildId")) });
  })
  .patch("/:guildId/members/:memberId/role", requireGuildRole("GUILD_LEADER"), async (c) => {
    const guildId = c.req.param("guildId");
    const memberId = c.req.param("memberId");
    const user = c.get("user");
    const { role, customRoleId } = await readJson<{ role?: string; customRoleId?: string | null }>(c);
    if (!customRoleId && (!role || !GUILD_ROLES.includes(role as GuildRoleType))) {
      throw new BadRequestError(`Invalid role. Must be one of: ${GUILD_ROLES.join(", ")}`);
    }
    const { ipAddress, userAgent } = getClientInfo(c);
    const updated = await services.guild.updateMemberRole(guildId, memberId, { role: role as GuildRoleType | undefined, customRoleId }, user.userId, ipAddress, userAgent);
    broadcastToGuild(guildId, "member_role_updated", updated);
    return ok(c, { member: updated });
  })

  // ─── Settings ────────────────────────────────────────────────
  .get("/:guildId/settings", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const cacheKey = `guild-settings:${guildId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const settings = await services.guild.getGuildSettings(guildId);
    await cache.set(cacheKey, settings, 300);
    return ok(c, settings);
  })
  .patch("/:guildId/settings", requireGuildRole("OFFICER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const payload = await readJson(c);
    const { ipAddress, userAgent } = getClientInfo(c);
    const settings = await services.guild.updateGuildSettings(guildId, payload, user.userId, ipAddress, userAgent);
    await Promise.all([
      cache.delete(`guild-settings:${guildId}`),
      cache.invalidatePattern(`accounting:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);
    return ok(c, settings);
  });

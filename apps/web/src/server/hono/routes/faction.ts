import { Hono } from "hono";
import { services, cache, BadRequestError } from "@guild/core";
import {
  updateFactionProfileSchema,
  updateFactionStatusSchema,
  updateFactionGuildMembershipSchema,
  assignFactionRoleSchema,
} from "@guild/shared";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { getClientInfo, readJson } from "../request";
import { zBody } from "../validation";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth";

/**
 * Faction domain — Hono port of apps/web/src/app/api/faction/**. All routes
 * authenticate with `requireAuth`; the faction service resolves the caller's
 * faction/leadership from their user id. Static segments (invite/search/redeem/
 * regenerate) take precedence over param routes in Hono.
 */
export const faction = new Hono<AppEnv>()
  // ─── Profile & status (Phase 1: Foundation) ───────────────────
  // Profile fields are Faction Leader/Admin (service-layer gated via
  // requireManagedFaction); status lifecycle is Super Admin only, gated here
  // at the route layer like every other platform-admin mutation (see admin.ts).
  .patch("/profile", requireAuth, zBody(updateFactionProfileSchema), async (c) => {
    const userId = c.get("user").userId;
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.faction.updateFactionProfile(userId, c.req.valid("json"), ipAddress, userAgent);
    await cache.invalidatePattern("faction-overview:*");
    return ok(c, result);
  })
  .post("/status", requirePlatformAdmin("ADMIN"), zBody(updateFactionStatusSchema), async (c) => {
    const { factionId, status, reason } = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    return ok(c, await services.faction.updateFactionStatus(c.get("user").userId, factionId, status, reason, ipAddress, userAgent));
  })

  // ─── Announcements ───────────────────────────────────────────
  .get("/announcements", requireAuth, async (c) => {
    return ok(c, { announcements: await services.faction.listAnnouncements(c.get("user").userId) });
  })
  .post("/announcements", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const announcement = await services.faction.createAnnouncement(c.get("user").userId, await readJson(c), ipAddress, userAgent);
    return ok(c, { announcement });
  })
  .patch("/announcements/:announcementId", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const announcement = await services.faction.updateAnnouncement(c.get("user").userId, c.req.param("announcementId"), await readJson(c), ipAddress, userAgent);
    return ok(c, { announcement });
  })
  .delete("/announcements/:announcementId", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.faction.deleteAnnouncement(c.get("user").userId, c.req.param("announcementId"), ipAddress, userAgent);
    return ok(c, data);
  })

  // ─── Events ──────────────────────────────────────────────────
  .get("/events", requireAuth, async (c) => {
    return ok(c, { events: await services.faction.listEvents(c.get("user").userId) });
  })
  .post("/events", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const event = await services.faction.createEvent(c.get("user").userId, await readJson(c), ipAddress, userAgent);
    return ok(c, { event });
  })
  .patch("/events/:eventId", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const event = await services.faction.updateEvent(c.get("user").userId, c.req.param("eventId"), await readJson(c), ipAddress, userAgent);
    return ok(c, { event });
  })
  .delete("/events/:eventId", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.faction.deleteEvent(c.get("user").userId, c.req.param("eventId"), ipAddress, userAgent);
    return ok(c, data);
  })

  // ─── Guilds within the faction ───────────────────────────────
  .post("/guilds/invite", requireAuth, async (c) => {
    const { guildId } = await readJson<{ guildId?: string }>(c);
    if (!guildId) throw new BadRequestError("guildId is required");
    const { ipAddress, userAgent } = getClientInfo(c);
    return ok(c, await services.faction.inviteGuildToFaction(c.get("user").userId, guildId, ipAddress, userAgent));
  })
  .get("/guilds/search", requireAuth, async (c) => {
    const guilds = await services.faction.searchGuilds(c.get("user").userId, c.req.query("q") ?? "");
    return ok(c, { guilds });
  })
  .post("/guilds/:guildId/remove", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    return ok(c, await services.faction.removeGuildFromFaction(c.get("user").userId, c.req.param("guildId"), ipAddress, userAgent));
  })

  // ─── Guild memberships (contribution requirement / assigned role / notes) ─
  // Cached like /members and /overview below, but WITH explicit invalidation
  // on the mutation — unlike those two, this list is edited directly from the
  // same tab that displays it, so a stale read would undo the UI's own
  // optimistic-refresh UX for up to the TTL.
  .get("/guild-memberships", requireAuth, async (c) => {
    const userId = c.get("user").userId;
    const cacheKey = `faction-guild-memberships:${userId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, { memberships: cached });
    const memberships = await services.faction.listFactionGuildMemberships(userId);
    await cache.set(cacheKey, memberships, 20);
    return ok(c, { memberships });
  })
  .patch("/guild-memberships/:guildId", requireAuth, zBody(updateFactionGuildMembershipSchema), async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const membership = await services.faction.updateFactionGuildMembership(
      c.get("user").userId,
      c.req.param("guildId"),
      c.req.valid("json"),
      ipAddress,
      userAgent,
    );
    await cache.invalidatePattern("faction-guild-memberships:*");
    return ok(c, { membership });
  })

  // ─── Faction capability roles (Officer / Treasurer / Inventory Manager) ───
  .get("/roles", requireAuth, async (c) => {
    const userId = c.get("user").userId;
    const cacheKey = `faction-roles:${userId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, { assignments: cached });
    const assignments = await services.faction.listFactionRoleAssignments(userId);
    await cache.set(cacheKey, assignments, 20);
    return ok(c, { assignments });
  })
  .post("/roles", requireAuth, zBody(assignFactionRoleSchema), async (c) => {
    const { guildMemberId, role } = c.req.valid("json");
    const { ipAddress, userAgent } = getClientInfo(c);
    const assignment = await services.faction.assignFactionRole(c.get("user").userId, guildMemberId, role, ipAddress, userAgent);
    await cache.invalidatePattern("faction-roles:*");
    return ok(c, { assignment }, 201);
  })
  .delete("/roles/:assignmentId", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    const result = await services.faction.revokeFactionRole(c.get("user").userId, c.req.param("assignmentId"), ipAddress, userAgent);
    await cache.invalidatePattern("faction-roles:*");
    return ok(c, result);
  })

  // ─── Audit log ───────────────────────────────────────────────
  // Short TTL, no explicit invalidation — same tradeoff as /members and
  // /overview below: this is a historical log, not an editable list, so a
  // few seconds of staleness after another action lands is an acceptable
  // cost for not wiring cache-busting into every audited mutation site.
  .get("/audit-logs", requireAuth, async (c) => {
    const userId = c.get("user").userId;
    const query = {
      from: c.req.query("from") || undefined,
      to: c.req.query("to") || undefined,
      action: c.req.query("action") || undefined,
      entityType: c.req.query("entityType") || undefined,
      page: c.req.query("page") ? Number(c.req.query("page")) : undefined,
      pageSize: c.req.query("pageSize") ? Number(c.req.query("pageSize")) : undefined,
    };
    const cacheKey = `faction-audit-logs:${userId}:${JSON.stringify(query)}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const result = await services.factionAudit.listFactionAuditLogs(userId, query);
    await cache.set(cacheKey, result, 15);
    return ok(c, result);
  })

  // ─── Invite code ─────────────────────────────────────────────
  .get("/invite-code", requireAuth, async (c) => {
    return ok(c, await services.faction.getFactionInviteCode(c.get("user").userId));
  })
  .post("/invite-code/regenerate", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    return ok(c, await services.faction.regenerateFactionInviteCode(c.get("user").userId, ipAddress, userAgent));
  })

  // ─── Join requests ───────────────────────────────────────────
  .get("/join-requests", requireAuth, async (c) => {
    return ok(c, { requests: await services.faction.listPendingForFaction(c.get("user").userId) });
  })
  .post("/join-requests/redeem", requireAuth, async (c) => {
    const { code } = await readJson<{ code?: string }>(c);
    if (!code) throw new BadRequestError("An invite code is required");
    const { ipAddress, userAgent } = getClientInfo(c);
    return ok(c, await services.faction.redeemFactionInviteCode(c.get("user").userId, code, ipAddress, userAgent));
  })
  .post("/join-requests/:requestId/approve", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    return ok(c, await services.faction.approveFactionJoinRequest(c.get("user").userId, c.req.param("requestId"), ipAddress, userAgent));
  })
  .post("/join-requests/:requestId/reject", requireAuth, async (c) => {
    const { ipAddress, userAgent } = getClientInfo(c);
    return ok(c, await services.faction.rejectFactionJoinRequest(c.get("user").userId, c.req.param("requestId"), ipAddress, userAgent));
  })

  // ─── Members & overview ──────────────────────────────────────
  // Short TTL, no explicit invalidation: bounds staleness after guild/member
  // changes elsewhere in the faction without wiring cache-busting across every
  // mutation site (matches the attendance:* caching pattern in dashboard.ts).
  .get("/members", requireAuth, async (c) => {
    const userId = c.get("user").userId;
    const cacheKey = `faction-members:${userId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, { members: cached });
    const members = await services.faction.getFactionMembers(userId);
    await cache.set(cacheKey, members, 20);
    return ok(c, { members });
  })
  .get("/overview", requireAuth, async (c) => {
    const userId = c.get("user").userId;
    const cacheKey = `faction-overview:${userId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(c, cached);
    const overview = await services.faction.getFactionOverview(userId);
    await cache.set(cacheKey, overview, 20);
    return ok(c, overview);
  });

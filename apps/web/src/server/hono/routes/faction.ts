import { Hono } from "hono";
import { services, cache, BadRequestError } from "@guild/core";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { getClientInfo, readJson } from "../request";
import { requireAuth } from "../middleware/auth";

/**
 * Faction domain — Hono port of apps/web/src/app/api/faction/**. All routes
 * authenticate with `requireAuth`; the faction service resolves the caller's
 * faction/leadership from their user id. Static segments (invite/search/redeem/
 * regenerate) take precedence over param routes in Hono.
 */
export const faction = new Hono<AppEnv>()
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

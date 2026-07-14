import { Hono } from "hono";
import { services, broadcastToGuild } from "@guild/core";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { getClientInfo, readJson } from "../request";
import { requireAuth } from "../middleware/auth";
import { dashboardLimit } from "../middleware/ratelimit";

/**
 * Guild activities domain — Hono port of apps/web/src/app/api/activities/**.
 * These routes authenticate with `requireAuth`; the activity service performs
 * its own per-guild authorization. Mutations broadcast a socket update.
 */
export const activities = new Hono<AppEnv>()
  .get("/:guildId", requireAuth, async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    dashboardLimit(c, user.userId);
    return ok(c, await services.activity.listActivities(guildId, user.userId));
  })
  .post("/:guildId", requireAuth, async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.activity.createActivity(guildId, user.userId, await readJson(c), ipAddress, userAgent);
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(c, data);
  })
  .patch("/:guildId/:activityId", requireAuth, async (c) => {
    const guildId = c.req.param("guildId");
    const activityId = c.req.param("activityId");
    const user = c.get("user");
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.activity.updateActivity(guildId, user.userId, activityId, await readJson(c), ipAddress, userAgent);
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(c, data);
  })
  .delete("/:guildId/:activityId", requireAuth, async (c) => {
    const guildId = c.req.param("guildId");
    const activityId = c.req.param("activityId");
    const user = c.get("user");
    const { ipAddress, userAgent } = getClientInfo(c);
    const data = await services.activity.deleteActivity(guildId, user.userId, activityId, ipAddress, userAgent);
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(c, data);
  })
  .post("/:guildId/:activityId/check-in", requireAuth, async (c) => {
    const guildId = c.req.param("guildId");
    const activityId = c.req.param("activityId");
    const user = c.get("user");
    const body = await readJson<{ attending?: boolean }>(c);
    const attending = body.attending !== false; // default: check in
    const data = await services.activity.setCheckIn(guildId, user.userId, activityId, attending);
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(c, data);
  })
  .post("/:guildId/:activityId/attendees/:userId/confirm", requireAuth, async (c) => {
    const guildId = c.req.param("guildId");
    const activityId = c.req.param("activityId");
    const targetUserId = c.req.param("userId");
    const actor = c.get("user");
    const body = await readJson<{ confirmed?: boolean }>(c);
    const confirmed = body.confirmed !== false; // default: confirm
    const data = await services.activity.setAttendeeConfirmation(guildId, actor.userId, activityId, targetUserId, confirmed);
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(c, data);
  });

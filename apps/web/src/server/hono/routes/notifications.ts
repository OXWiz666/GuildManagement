import { Hono } from "hono";
import { services } from "@guild/core";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { requireAuth } from "../middleware/auth";

/**
 * Notifications domain — Hono port of apps/web/src/app/api/notifications/**.
 * User-scoped (not guild-scoped); authenticates with `requireAuth`.
 */
export const notifications = new Hono<AppEnv>()
  .get("/", requireAuth, async (c) => {
    const user = c.get("user");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 20;
    return ok(c, await services.notification.getNotifications(user.userId, limit));
  })
  .patch("/read-all", requireAuth, async (c) => {
    const user = c.get("user");
    return ok(c, await services.notification.markAllNotificationsRead(user.userId));
  })
  .patch("/:notificationId/read", requireAuth, async (c) => {
    const user = c.get("user");
    const notificationId = c.req.param("notificationId");
    const notification = await services.notification.markNotificationRead(user.userId, notificationId);
    return ok(c, { notification });
  });

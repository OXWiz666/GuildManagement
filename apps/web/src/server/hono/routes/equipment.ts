import { Hono } from "hono";
import { services, cache } from "@guild/core";
import { confirmEquipmentSchema, uploadScreenshotSchema } from "@guild/shared";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { readJson } from "../request";
import { requireAuth, requireGuildRole } from "../middleware/auth";

/**
 * Equipment domain — Hono port of apps/web/src/app/api/equipment/**. The two
 * catalog reads are only auth-gated; per-guild reads/writes use
 * `requireGuildRole`. Confirm/screenshot validate a body that merges the route
 * `:guildId` in, so they parse manually (mirroring the previous handlers)
 * rather than using `zBody`.
 */
export const equipment = new Hono<AppEnv>()
  // Static catalog routes registered before `:guildId` to avoid ambiguity.
  // Global (not per-guild) and never invalidated by writes here, so a longer
  // TTL is safe.
  .get("/catalog", requireAuth, async (c) => {
    const cached = await cache.get<unknown>("equipment:catalog");
    if (cached) return ok(c, cached);
    const data = await services.equipment.getCatalog();
    await cache.set("equipment:catalog", data, 300);
    return ok(c, data);
  })
  .get("/drops-catalog", requireAuth, async (c) => {
    const cached = await cache.get<unknown>("equipment:drops-catalog");
    if (cached) return ok(c, cached);
    const data = await services.equipment.getDropsCatalog();
    await cache.set("equipment:drops-catalog", data, 300);
    return ok(c, data);
  })
  .get("/:guildId/mine", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    return ok(c, await services.equipment.getMyEquipment(guildId, user.userId));
  })
  .post("/:guildId/confirm", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const data = confirmEquipmentSchema.parse({ ...(await readJson(c)), guildId });
    const result = await services.equipment.confirmEquipment(data.guildId, user.userId, data.items, data.sourceScreenshotPath);
    return ok(c, result, 201);
  })
  .post("/:guildId/screenshot", requireGuildRole("MEMBER"), async (c) => {
    const guildId = c.req.param("guildId");
    const user = c.get("user");
    const data = uploadScreenshotSchema.parse({ ...(await readJson(c)), guildId });
    const result = await services.equipment.uploadScreenshot(data.guildId, user.userId, data.dataUrl);
    return ok(c, result, 201);
  });

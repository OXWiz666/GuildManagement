import { Hono } from "hono";
import { services } from "@guild/core";
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
  .get("/catalog", requireAuth, async (c) => {
    return ok(c, await services.equipment.getCatalog());
  })
  .get("/drops-catalog", requireAuth, async (c) => {
    return ok(c, await services.equipment.getDropsCatalog());
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

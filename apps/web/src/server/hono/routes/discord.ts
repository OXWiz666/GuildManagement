import { Hono } from "hono";
import { z } from "zod";
import { services } from "@guild/core";
import type { AppEnv } from "../env";
import { ok } from "../respond";
import { requireAuth } from "../middleware/auth";
import { discordLinkLimit } from "../middleware/ratelimit";
import { zBody } from "../validation";

const bossAliasSchema = z.object({
  alias: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Alias must be at least 2 characters")
    .max(32, "Alias must be at most 32 characters")
    .regex(/^[a-z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores"),
  bossName: z.string().trim().min(1, "Boss name is required").max(80, "Boss name is too long"),
});

/**
 * Discord integration — the website half of account linking.
 *
 * The bot never authenticates a user itself. Instead this endpoint mints a
 * short-lived one-time code for the *already authenticated* web session, which
 * the user echoes in Discord via `!link <code>`. Possession of the code proves
 * possession of a logged-in ForgeKeep session, so no credential ever reaches
 * the bot.
 *
 * User-scoped (not guild-scoped) — a link belongs to an account, not a guild.
 */
export const discord = new Hono<AppEnv>()
  .get("/link-status", requireAuth, async (c) => {
    const user = c.get("user");
    return ok(c, await services.discordLink.getDiscordLinkStatus(user.userId));
  })
  .post("/link-code", requireAuth, async (c) => {
    const user = c.get("user");
    // Rate-limited: this issues a credential.
    discordLinkLimit(c, user.userId);
    return ok(c, await services.discordLink.createLinkCode(user.userId));
  })
  .delete("/link", requireAuth, async (c) => {
    const user = c.get("user");
    await services.discordLink.unlinkDiscord(user.userId);
    return ok(c, { unlinked: true });
  })

  // ─── Guild-level config (Guild Settings → Discord Integration) ───
  // Guild-scoped, unlike the per-user link endpoints above. Every handler
  // passes the actor through to the service, which authorizes against that
  // guild's own roster — being an officer elsewhere grants nothing here.
  .get("/guilds/:guildId/integration", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    return ok(c, await services.discordLink.getGuildDiscordIntegration(guildId, user.userId));
  })
  .post("/guilds/:guildId/aliases", requireAuth, zBody(bossAliasSchema), async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const body = c.req.valid("json");
    return ok(
      c,
      await services.discordLink.addBossAlias(
        guildId,
        user.userId,
        body.alias,
        body.bossName,
      ),
    );
  })
  .delete("/guilds/:guildId/aliases/:aliasId", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    const aliasId = c.req.param("aliasId");
    await services.discordLink.removeBossAlias(guildId, user.userId, aliasId);
    return ok(c, { removed: true });
  })
  .delete("/guilds/:guildId/binding", requireAuth, async (c) => {
    const user = c.get("user");
    const guildId = c.req.param("guildId");
    await services.discordLink.unbindDiscordServer(guildId, user.userId);
    return ok(c, { unbound: true });
  });

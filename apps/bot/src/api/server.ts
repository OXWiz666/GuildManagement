import { timingSafeEqual } from "node:crypto";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { services as core } from "@guild/core";
import { env } from "../config/env.js";
import type { ServiceContainer } from "../services/container.js";
import { consumeApiBudget } from "./rateLimit.js";
import { logger, errorFields } from "../utils/logger.js";

/**
 * Read-only public API for external tools/scripts.
 *
 * Deliberately separate from apps/web's Hono routes: this is a different trust
 * model (one shared bearer key, not the website's user sessions/JWTs) and a
 * different audience (integrators the operator hands the key to directly).
 * Nothing here is linked from, or documented on, forgekeep.io — the only way
 * to find it is to already have the key.
 *
 * The key is global, not per-guild: it can read any guild's data. Treat it
 * like an admin credential — hand it out sparingly, rotate it by changing
 * PUBLIC_API_KEY and restarting.
 */
export function createApiServer(services: ServiceContainer): { start(): ServerType; stop(server: ServerType): Promise<void> } {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok", service: "forgekeep-bot" }));

  const v1 = new Hono();

  v1.use("*", async (c, next) => {
    const auth = c.req.header("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const expected = env.PUBLIC_API_KEY ?? "";

    if (!token || !constantTimeEquals(token, expected)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const decision = await consumeApiBudget(token);
    c.header("X-RateLimit-Limit", String(env.RATE_LIMIT_API_PER_MIN));
    c.header("X-RateLimit-Remaining", String(decision.remaining));
    if (!decision.allowed) {
      c.header("Retry-After", String(decision.resetInSeconds));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    await next();
  });

  v1.get("/guilds/:guildId/cp/leaderboard", async (c) => {
    const guildId = c.req.param("guildId");
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize")) || 20));

    const result = await services.cp.leaderboard(guildId, page, pageSize);
    return c.json(result);
  });

  v1.get("/guilds/:guildId/bosses/upcoming", async (c) => {
    const guildId = c.req.param("guildId");
    const rows = await services.boss.listUpcoming({ guildId });
    return c.json({ rows });
  });

  v1.get("/guilds/:guildId/members", async (c) => {
    const guildId = c.req.param("guildId");
    const members = await core.guild.getGuildMembers(guildId);

    // Explicit allowlist, never a passthrough — GuildMemberWithUser carries
    // `user.email`, which a shared external-facing key must never surface.
    const rows = members
      .filter((m) => m.isActive)
      .map((m) => ({
        id: m.id,
        ign: m.ign,
        displayName: m.user.displayName,
        role: m.role,
        rankName: m.rankName,
        cp: m.cp,
        class: m.class,
        weapon: m.weapon,
      }));

    return c.json({ rows });
  });

  app.route("/v1", v1);

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError((error, c) => {
    logger.error("Public API request failed", errorFields(error));
    return c.json({ error: "Internal error" }, 500);
  });

  return {
    start() {
      const port = Number(process.env["PORT"]) || env.PUBLIC_API_PORT;
      const server = serve({ fetch: app.fetch, port });
      logger.info("Public API listening", { port });
      return server;
    },
    async stop(server: ServerType) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

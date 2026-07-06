import type { NextRequest } from "next/server";
import { services, cache } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/settings">) => {
    const { guildId } = await ctx.params;
    await requireGuildRole(req, "MEMBER", guildId);

    const cacheKey = `guild-settings:${guildId}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(cached);

    const settings = await services.guild.getGuildSettings(guildId);
    await cache.set(cacheKey, settings, 300);
    return ok(settings);
  },
);

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/settings">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const payload = await readJson(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    const settings = await services.guild.updateGuildSettings(
      guildId,
      payload,
      user.userId,
      ipAddress,
      userAgent,
    );

    await Promise.all([
      cache.delete(`guild-settings:${guildId}`),
      cache.invalidatePattern(`accounting:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);

    return ok(settings);
  },
);

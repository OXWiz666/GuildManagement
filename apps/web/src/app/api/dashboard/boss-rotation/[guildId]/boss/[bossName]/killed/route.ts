import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/boss/[bossName]/killed">,
  ) => {
    const user = requireAuth(req);
    const { guildId, bossName: rawBossName } = await ctx.params;
    const bossName = decodeURIComponent(rawBossName);
    const { killedAt, takenGuildId, drops } = await readJson<{
      killedAt: string;
      takenGuildId: string;
      drops?: Array<{ bucket: string; path: string; quantity?: number }>;
    }>(req);

    if (!killedAt) throw new BadRequestError("Killed timestamp is required");
    if (!takenGuildId) throw new BadRequestError("Taking guild is required");

    const { ipAddress, userAgent } = getClientInfo(req);
    const data = await services.dashboard.markBossRotationKilledByName(
      guildId,
      bossName,
      killedAt,
      takenGuildId,
      user.userId,
      ipAddress,
      userAgent,
      drops,
    );

    await Promise.all([
      cache.invalidatePattern(`boss-schedule:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);

    broadcastToGuild(null, "boss_rotation_updated", data);
    broadcastToGuild(guildId, "boss_rotation_updated", data);

    return ok(data);
  },
);

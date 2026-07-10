import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, broadcastToFaction } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo } from "@/server/request";

export const runtime = "nodejs";

// Restart the spawn timer for EVERY boss from the current moment. Leaders and
// Officers only (enforced in the service).
export const POST = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/reset">,
  ) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const { ipAddress, userAgent } = getClientInfo(req);

    const data = await services.dashboard.resetAllBossTimers(
      guildId,
      user.userId,
      ipAddress,
      userAgent,
    );

    await Promise.all([
      cache.invalidatePattern(`boss-schedule:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);

    broadcastToFaction(data.factionId, "boss_rotation_updated", data);
    broadcastToGuild(guildId, "boss_rotation_updated", data);

    return ok(data);
  },
);

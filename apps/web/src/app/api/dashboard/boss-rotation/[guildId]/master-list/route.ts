import type { NextRequest } from "next/server";
import { services, cache, broadcastToFaction } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { dashboardLimit } from "@/server/ratelimit";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/master-list">,
  ) => {
    const user = requireAuth(req);
    dashboardLimit(req, user.userId);
    const { guildId } = await ctx.params;
    return ok(await services.dashboard.getBossMasterList(guildId, user.userId));
  },
);

export const PUT = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/master-list">,
  ) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const { entries } = await readJson<{
      entries: Array<{ bossName: string; participantGuildIds: string[] }>;
    }>(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    const data = await services.dashboard.updateBossMasterList(
      guildId,
      user.userId,
      entries,
      ipAddress,
      userAgent,
    );

    await cache.invalidatePattern(`boss-schedule:*`);
    broadcastToFaction(data.factionId, "boss_rotation_updated", data);

    return ok(data);
  },
);

import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

// `[ref]` unifies the Express `:bossName` and `:scheduleId` segments (Next.js
// forbids two differently-named dynamic segments at the same level). Here it is
// the boss name.
export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/[ref]/queue">) => {
    const user = requireAuth(req);
    const { guildId, ref } = await ctx.params;
    const bossName = decodeURIComponent(ref);
    const { queueGuildIds } = await readJson<{ queueGuildIds: string[] }>(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    const data = await services.dashboard.updateBossRotationQueue(
      guildId,
      bossName,
      queueGuildIds,
      user.userId,
      ipAddress,
      userAgent,
    );

    await cache.invalidatePattern(`boss-schedule:*`);
    broadcastToGuild(null, "boss_rotation_updated", data);

    return ok(data);
  },
);

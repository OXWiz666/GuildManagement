import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, broadcastToFaction, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

// Restart the spawn timer for cycle-based bosses relative to a maintenance-end
// time (fixed-schedule bosses are untouched). Leaders and Officers only.
export const POST = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/maintenance-reset">,
  ) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const { maintenanceEndTime } = await readJson<{ maintenanceEndTime: string }>(req);

    if (!maintenanceEndTime) throw new BadRequestError("Maintenance end time is required");

    const { ipAddress, userAgent } = getClientInfo(req);

    const data = await services.dashboard.maintenanceResetBossTimers(
      guildId,
      user.userId,
      maintenanceEndTime,
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

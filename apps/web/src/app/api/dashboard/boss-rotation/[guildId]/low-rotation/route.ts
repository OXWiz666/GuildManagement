import type { NextRequest } from "next/server";
import { services, broadcastToFaction } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { dashboardLimit } from "@/server/ratelimit";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/low-rotation">,
  ) => {
    const user = requireAuth(req);
    dashboardLimit(req, user.userId);
    const { guildId } = await ctx.params;
    return ok(await services.dashboard.getLowBossRotation(guildId, user.userId));
  },
);

export const PUT = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/low-rotation">,
  ) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const payload = await readJson<{
      mode?: string;
      lowBossNames?: string[];
      weekly?: Record<string, string>;
      daysPatch?: Record<string, string | null>;
    }>(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    const data = await services.dashboard.updateLowBossRotation(
      guildId,
      user.userId,
      payload,
      ipAddress,
      userAgent,
    );

    broadcastToFaction(data.factionId, "boss_rotation_updated", data);
    return ok(data);
  },
);

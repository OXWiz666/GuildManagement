import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";
import { dashboardLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/activities/[guildId]">) => {
    const { guildId } = await ctx.params;
    const user = requireAuth(req);
    dashboardLimit(req, user.userId);
    return ok(await services.activity.listActivities(guildId, user.userId));
  },
);

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/activities/[guildId]">) => {
    const { guildId } = await ctx.params;
    const user = requireAuth(req);
    const { ipAddress, userAgent } = getClientInfo(req);
    const data = await services.activity.createActivity(
      guildId,
      user.userId,
      await readJson(req),
      ipAddress,
      userAgent,
    );
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(data);
  },
);

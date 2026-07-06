import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/activities/[guildId]/[activityId]">) => {
    const { guildId, activityId } = await ctx.params;
    const user = requireAuth(req);
    const { ipAddress, userAgent } = getClientInfo(req);
    const data = await services.activity.updateActivity(
      guildId,
      user.userId,
      activityId,
      await readJson(req),
      ipAddress,
      userAgent,
    );
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(data);
  },
);

export const DELETE = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/activities/[guildId]/[activityId]">) => {
    const { guildId, activityId } = await ctx.params;
    const user = requireAuth(req);
    const { ipAddress, userAgent } = getClientInfo(req);
    const data = await services.activity.deleteActivity(
      guildId,
      user.userId,
      activityId,
      ipAddress,
      userAgent,
    );
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(data);
  },
);

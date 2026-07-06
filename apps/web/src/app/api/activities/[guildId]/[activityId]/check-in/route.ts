import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/activities/[guildId]/[activityId]/check-in">) => {
    const { guildId, activityId } = await ctx.params;
    const user = requireAuth(req);
    const body = await readJson<{ attending?: boolean }>(req);
    const attending = body.attending !== false; // default: check in
    const data = await services.activity.setCheckIn(guildId, user.userId, activityId, attending);
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(data);
  },
);

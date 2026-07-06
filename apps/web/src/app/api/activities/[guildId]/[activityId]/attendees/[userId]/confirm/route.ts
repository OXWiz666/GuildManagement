import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/activities/[guildId]/[activityId]/attendees/[userId]/confirm">,
  ) => {
    const { guildId, activityId, userId } = await ctx.params;
    const actor = requireAuth(req);
    const body = await readJson<{ confirmed?: boolean }>(req);
    const confirmed = body.confirmed !== false; // default: confirm
    const data = await services.activity.setAttendeeConfirmation(
      guildId,
      actor.userId,
      activityId,
      userId,
      confirmed,
    );
    broadcastToGuild(guildId, "guild_activity_updated", { guildId });
    return ok(data);
  },
);

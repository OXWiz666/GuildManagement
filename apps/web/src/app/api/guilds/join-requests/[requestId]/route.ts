import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const DELETE = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/join-requests/[requestId]">) => {
    const user = requireAuth(req);
    const { requestId } = await ctx.params;
    const result = await services.application.cancelJoinRequest(user.userId, requestId);
    broadcastToGuild(result.guildId, "join_request_cancelled", { requestId });
    return ok(result);
  },
);

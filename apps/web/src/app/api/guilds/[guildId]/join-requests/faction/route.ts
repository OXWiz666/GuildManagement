import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

// Pending faction DIRECT_INVITE requests that this guild's own leadership
// needs to accept/reject.
export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/join-requests/faction">) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const requests = await services.faction.listPendingForGuild(user.userId, guildId);
    return ok({ requests });
  },
);

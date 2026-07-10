import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/faction/guilds/[guildId]/remove">) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const { ipAddress, userAgent } = getClientInfo(req);
    const result = await services.faction.removeGuildFromFaction(user.userId, guildId, ipAddress, userAgent);
    return ok(result);
  },
);

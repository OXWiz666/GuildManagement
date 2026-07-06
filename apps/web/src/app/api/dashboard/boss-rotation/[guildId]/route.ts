import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { dashboardLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]">) => {
    const user = requireAuth(req);
    dashboardLimit(req, user.userId);
    const { guildId } = await ctx.params;
    return ok(await services.dashboard.getBossRotation(guildId, user.userId));
  },
);

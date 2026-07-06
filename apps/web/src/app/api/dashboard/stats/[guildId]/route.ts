import type { NextRequest } from "next/server";
import { services, cache } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { dashboardLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/stats/[guildId]">) => {
    const user = requireAuth(req);
    dashboardLimit(req, user.userId);
    const { guildId } = await ctx.params;
    const cacheKey = `stats:${guildId}:user:${user.userId}`;

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(cached);

    const stats = await services.dashboard.getDashboardSummary(guildId, user.userId);
    await cache.set(cacheKey, stats, 30);
    return ok(stats);
  },
);

import type { NextRequest } from "next/server";
import { services, cache } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/attendance/stats/[guildId]">) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const cacheKey = `attendance:stats:${guildId}:user:${user.userId}`;

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(cached);

    const stats = await services.dashboard.getMemberAttendanceStats(guildId, user.userId);
    await cache.set(cacheKey, stats, 15);
    return ok(stats);
  },
);

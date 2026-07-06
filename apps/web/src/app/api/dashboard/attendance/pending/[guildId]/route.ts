import type { NextRequest } from "next/server";
import { services, cache } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/attendance/pending/[guildId]">) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const cacheKey = `attendance:pending:${guildId}:user:${user.userId}`;

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(cached);

    const result = await services.dashboard.getGuildPendingAttendance(guildId, user.userId);
    await cache.set(cacheKey, result, 15);
    return ok(result);
  },
);

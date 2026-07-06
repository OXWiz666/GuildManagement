import type { NextRequest } from "next/server";
import { services, cache } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { dashboardLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/accounting/[guildId]">) => {
    const user = requireAuth(req);
    dashboardLimit(req, user.userId);
    const { guildId } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const page = sp.get("page") ? parseInt(sp.get("page")!, 10) : 1;
    const limit = sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 25;
    const cacheKey = `accounting:${guildId}:p${page}:l${limit}`;

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(cached);

    const data = await services.dashboard.getAccountingDashboard(guildId, user.userId, page, limit);
    await cache.set(cacheKey, data, 60);
    return ok(data);
  },
);

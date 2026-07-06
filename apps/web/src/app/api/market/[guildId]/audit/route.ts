import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/audit">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const sp = req.nextUrl.searchParams;
    const result = await services.market.getMarketAuditLogs(guildId, user.userId, {
      action: sp.get("action") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return ok(result);
  },
);

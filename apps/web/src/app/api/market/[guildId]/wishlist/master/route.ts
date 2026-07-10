import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/wishlist/master">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const category = sp.get("category");
    const rows = await services.market.getWishlistMasterList(guildId, user.userId, {
      status: status === "PENDING" || status === "DISTRIBUTED" ? status : undefined,
      category: category ?? undefined,
      memberId: sp.get("memberId") ?? undefined,
      search: sp.get("search") ?? undefined,
    });
    return ok({ rows });
  },
);

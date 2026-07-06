import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/wishlist/mine">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    return ok(await services.market.getMyWishlist(guildId, user.userId));
  },
);

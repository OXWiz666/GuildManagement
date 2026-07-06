import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { wishlistSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const PUT = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/wishlist">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    const data = wishlistSchema.parse(await readJson(req));
    return ok(await services.market.setWishlist(guildId, user.userId, data.items));
  },
);

import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/boss-drops">,
  ) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const bossName = req.nextUrl.searchParams.get("bossName") ?? "";
    return ok(await services.dashboard.getBossDropsForBoss(user.userId, guildId, bossName));
  },
);

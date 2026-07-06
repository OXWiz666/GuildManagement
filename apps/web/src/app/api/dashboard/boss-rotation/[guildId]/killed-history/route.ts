import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/boss-rotation/[guildId]/killed-history">,
  ) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const month = req.nextUrl.searchParams.get("month") ?? undefined;
    return ok(await services.dashboard.getBossKilledHistory(guildId, user.userId, month));
  },
);

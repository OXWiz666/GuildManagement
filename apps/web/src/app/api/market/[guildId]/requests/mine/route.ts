import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/requests/mine">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    const pageParam = req.nextUrl.searchParams.get("page");
    const page = pageParam ? Number(pageParam) : 1;
    return ok(await services.requests.getMyRequests(guildId, user.userId, page));
  },
);

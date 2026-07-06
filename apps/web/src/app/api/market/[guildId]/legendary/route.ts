import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { legendaryPrioritySchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/legendary">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    const data = legendaryPrioritySchema.parse(await readJson(req));
    const request = await services.market.createLegendaryRequest(guildId, user.userId, data);
    return ok({ request }, 201);
  },
);

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/legendary">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    const sp = req.nextUrl.searchParams;
    const result = await services.market.getLegendaryRequests(guildId, user.userId, {
      status: sp.get("status") ?? undefined,
      category: sp.get("category") ?? undefined,
    });
    return ok(result);
  },
);

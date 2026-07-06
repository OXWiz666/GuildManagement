import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { createDistributionSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/distributions">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const data = createDistributionSchema.parse(await readJson(req));
    const distribution = await services.market.createDistribution(guildId, user.userId, data);
    return ok({ distribution }, 201);
  },
);

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/distributions">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    const sp = req.nextUrl.searchParams;
    const result = await services.market.getDistributions(guildId, user.userId, {
      mineOnly: sp.get("mine") === "true",
      memberId: sp.get("memberId") ?? undefined,
      tier: sp.get("tier") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return ok(result);
  },
);

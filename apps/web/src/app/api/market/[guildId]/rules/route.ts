import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { marketRulesSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/rules">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    const rules = await services.market.getMarketRules(guildId, user.userId);
    return ok({ rules });
  },
);

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/rules">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const data = marketRulesSchema.parse(await readJson(req));
    const rules = await services.market.updateMarketRules(guildId, user.userId, data as never);
    return ok({ rules });
  },
);

import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/loot-sale/[guildId]">) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const { itemName, category, bossScheduleId, saleValue, currency } = await readJson<{
      itemName: string;
      category: string;
      bossScheduleId?: string | null;
      saleValue: number;
      currency: string;
    }>(req);

    if (!itemName || !category || !saleValue || isNaN(Number(saleValue))) {
      throw new BadRequestError("Missing item name, category, or invalid sale value");
    }

    const centsValue = BigInt(Math.round(saleValue * 100));
    const sale = await services.loot.createLootSale({
      guildId,
      bossScheduleId,
      itemName,
      category,
      saleValue: centsValue,
      currency,
      creatorId: user.userId,
    });

    await Promise.all([
      cache.invalidatePattern(`accounting:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
      cache.invalidatePattern(`loot:${guildId}:*`),
    ]);

    const socketPayload = {
      ...sale,
      saleValue: sale.saleValue.toString(),
      taxAmount: sale.taxAmount.toString(),
      netProfit: sale.netProfit.toString(),
      createdAt: sale.createdAt.toISOString(),
    };
    broadcastToGuild(guildId, "loot_sale_recorded", socketPayload);

    return ok({ sale: socketPayload });
  },
);

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/loot-sale/[guildId]">) => {
    requireAuth(req);
    const { guildId } = await ctx.params;
    const cacheKey = `loot:${guildId}:sales`;

    const cached = await cache.get<unknown>(cacheKey);
    if (cached) return ok(cached);

    const sales = await services.loot.getLootSales(guildId);
    const data = { sales };
    await cache.set(cacheKey, data, 120);
    return ok(data);
  },
);

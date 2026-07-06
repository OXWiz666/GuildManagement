import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/loot-sale/[guildId]/batch">) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const { category, bossScheduleId, currency, soldDate, items } = await readJson<{
      category: string;
      bossScheduleId?: string | null;
      currency: string;
      soldDate?: string;
      items: Array<{ itemName: string; saleValue: number }>;
    }>(req);

    if (!category || !currency || !Array.isArray(items) || items.length === 0) {
      throw new BadRequestError("Missing category, currency, or loot items");
    }

    const normalizedItems = items.map((item) => ({
      itemName: (item.itemName || "").trim(),
      saleValue: Number(item.saleValue),
    }));

    const invalid = normalizedItems.some(
      (item) => !item.itemName || isNaN(item.saleValue) || item.saleValue <= 0,
    );
    if (invalid) {
      throw new BadRequestError("Each loot item needs a name and a positive sale value");
    }

    const sales = await services.loot.createLootSaleBatch({
      guildId,
      bossScheduleId: bossScheduleId || null,
      category,
      currency,
      creatorId: user.userId,
      soldAt: soldDate ? new Date(soldDate) : null,
      items: normalizedItems.map((item) => ({
        itemName: item.itemName,
        saleValue: BigInt(Math.round(item.saleValue * 100)),
      })),
    });

    await Promise.all([
      cache.invalidatePattern(`accounting:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
      cache.invalidatePattern(`loot:${guildId}:*`),
    ]);

    broadcastToGuild(guildId, "loot_sale_recorded", {
      batch: true,
      count: sales.length,
      bossScheduleId: bossScheduleId || null,
    });

    return ok({ count: sales.length });
  },
);

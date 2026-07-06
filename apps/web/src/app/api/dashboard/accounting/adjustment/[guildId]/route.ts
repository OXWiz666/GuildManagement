import type { NextRequest } from "next/server";
import { services, cache, broadcastToGuild, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/dashboard/accounting/adjustment/[guildId]">) => {
    const user = requireAuth(req);
    const { guildId } = await ctx.params;
    const payload = await readJson<{
      accountId: string;
      accountType: "MEMBER" | "GUILD_FUND" | "TAX";
      entryType: "CREDIT" | "DEBIT";
      amount: number;
      currency: string;
      description: string;
    }>(req);

    if (
      !payload.accountId ||
      !payload.accountType ||
      !payload.entryType ||
      !payload.amount ||
      !payload.currency ||
      !payload.description
    ) {
      throw new BadRequestError("Missing dynamic transaction details");
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    const entry = await services.dashboard.createTreasuryAdjustment(
      guildId,
      payload,
      user.userId,
      ipAddress,
      userAgent,
    );

    await Promise.all([
      cache.invalidatePattern(`accounting:${guildId}:*`),
      cache.invalidatePattern(`stats:${guildId}:*`),
    ]);

    const socketPayload = {
      ...entry,
      amount: entry.amount.toString(),
      createdAt: entry.createdAt.toISOString(),
    };
    broadcastToGuild(guildId, "treasury_adjusted", socketPayload);

    return ok({ entry: socketPayload });
  },
);

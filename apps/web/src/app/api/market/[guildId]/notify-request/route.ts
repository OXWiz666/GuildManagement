import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { notifyRequestSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/notify-request">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const data = notifyRequestSchema.parse(await readJson(req));
    return ok(await services.market.notifyMembersToRequest(guildId, user.userId, data));
  },
);

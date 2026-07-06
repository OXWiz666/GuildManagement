import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (
    req: NextRequest,
    ctx: RouteContext<"/api/dashboard/loot-sale/[guildId]/attendees/[bossScheduleId]">,
  ) => {
    requireAuth(req);
    const { guildId, bossScheduleId } = await ctx.params;
    const map = await services.loot.getConfirmedAttendeesForSchedules(guildId, [bossScheduleId]);
    const attendees = map.get(bossScheduleId) ?? [];
    return ok({ attendees });
  },
);

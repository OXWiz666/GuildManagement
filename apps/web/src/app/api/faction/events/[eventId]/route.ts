import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/faction/events/[eventId]">) => {
    const user = requireAuth(req);
    const { eventId } = await ctx.params;
    const { ipAddress, userAgent } = getClientInfo(req);
    const event = await services.faction.updateEvent(
      user.userId,
      eventId,
      await readJson(req),
      ipAddress,
      userAgent,
    );
    return ok({ event });
  },
);

export const DELETE = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/faction/events/[eventId]">) => {
    const user = requireAuth(req);
    const { eventId } = await ctx.params;
    const { ipAddress, userAgent } = getClientInfo(req);
    const data = await services.faction.deleteEvent(user.userId, eventId, ipAddress, userAgent);
    return ok(data);
  },
);

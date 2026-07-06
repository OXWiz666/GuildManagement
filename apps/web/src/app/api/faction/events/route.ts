import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const events = await services.faction.listEvents(user.userId);
  return ok({ events });
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const { ipAddress, userAgent } = getClientInfo(req);
  const event = await services.faction.createEvent(
    user.userId,
    await readJson(req),
    ipAddress,
    userAgent,
  );
  return ok({ event });
});

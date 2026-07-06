import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const announcements = await services.faction.listAnnouncements(user.userId);
  return ok({ announcements });
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const { ipAddress, userAgent } = getClientInfo(req);
  const announcement = await services.faction.createAnnouncement(
    user.userId,
    await readJson(req),
    ipAddress,
    userAgent,
  );
  return ok({ announcement });
});

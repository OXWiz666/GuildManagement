import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 20;
  return ok(await services.notification.getNotifications(user.userId, limit));
});

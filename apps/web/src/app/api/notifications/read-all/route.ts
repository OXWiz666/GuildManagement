import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const PATCH = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  return ok(await services.notification.markAllNotificationsRead(user.userId));
});

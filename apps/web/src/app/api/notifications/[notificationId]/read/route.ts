import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/notifications/[notificationId]/read">) => {
    const user = requireAuth(req);
    const { notificationId } = await ctx.params;
    const notification = await services.notification.markNotificationRead(
      user.userId,
      notificationId,
    );
    return ok({ notification });
  },
);

import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, okEmpty } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo } from "@/server/request";

export const runtime = "nodejs";

export const DELETE = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/auth/sessions/[id]">) => {
    const user = requireAuth(req);
    const { id } = await ctx.params;
    const { ipAddress, userAgent } = getClientInfo(req);
    await services.auth.revokeSession(id, user.userId, ipAddress, userAgent);
    return okEmpty();
  },
);

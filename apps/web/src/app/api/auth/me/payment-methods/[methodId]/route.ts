import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const DELETE = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/auth/me/payment-methods/[methodId]">) => {
    const { methodId } = await ctx.params;
    const user = requireAuth(req);
    return ok(await services.auth.removePaymentMethod(user.userId, methodId));
  },
);

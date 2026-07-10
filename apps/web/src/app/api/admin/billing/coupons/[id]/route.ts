import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";

export const runtime = "nodejs";

export const DELETE = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requirePlatformAdmin(req, "ADMIN");
  const { id } = await ctx.params;
  return ok(await services.billing.deactivateCoupon(user.userId, id));
});

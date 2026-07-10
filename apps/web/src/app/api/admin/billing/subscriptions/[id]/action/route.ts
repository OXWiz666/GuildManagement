import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { subscriptionActionSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requirePlatformAdmin(req, "ADMIN");
  const { id } = await ctx.params;
  const data = subscriptionActionSchema.parse(await readJson(req));
  return ok({ subscription: await services.billing.changeSubscriptionStatus(user.userId, id, data.action) });
});

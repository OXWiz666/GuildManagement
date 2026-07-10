import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { planUpdateSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requirePlatformAdmin(req, "ADMIN");
  const { id } = await ctx.params;
  const data = planUpdateSchema.parse(await readJson(req));
  return ok({ plan: await services.billing.updatePlan(user.userId, id, data) });
});

export const DELETE = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requirePlatformAdmin(req, "ADMIN");
  const { id } = await ctx.params;
  return ok(await services.billing.deactivatePlan(user.userId, id));
});

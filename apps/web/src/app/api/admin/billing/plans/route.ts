import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { planSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  await requirePlatformAdmin(req);
  return ok({ plans: await services.billing.listPlans() });
});

export const POST = withApi(async (req: NextRequest) => {
  const { user } = await requirePlatformAdmin(req, "ADMIN");
  const data = planSchema.parse(await readJson(req));
  return ok({ plan: await services.billing.createPlan(user.userId, data) });
});

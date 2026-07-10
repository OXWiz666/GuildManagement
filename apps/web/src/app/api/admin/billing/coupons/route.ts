import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { couponSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  await requirePlatformAdmin(req);
  return ok({ coupons: await services.billing.listCoupons() });
});

export const POST = withApi(async (req: NextRequest) => {
  const { user } = await requirePlatformAdmin(req, "ADMIN");
  const data = couponSchema.parse(await readJson(req));
  return ok({ coupon: await services.billing.createCoupon(user.userId, data) });
});

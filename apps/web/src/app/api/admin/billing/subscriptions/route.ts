import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { subscriptionCreateSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  await requirePlatformAdmin(req);
  const sp = new URL(req.url).searchParams;
  return ok(
    await services.billing.listSubscriptions({
      status: sp.get("status") || undefined,
      guildId: sp.get("guildId") || undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
    }),
  );
});

export const POST = withApi(async (req: NextRequest) => {
  const { user } = await requirePlatformAdmin(req, "ADMIN");
  const data = subscriptionCreateSchema.parse(await readJson(req));
  return ok({ subscription: await services.billing.createSubscription(user.userId, data) });
});

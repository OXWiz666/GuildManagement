import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { addPaymentMethodSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const data = addPaymentMethodSchema.parse(await readJson(req));
  const method = await services.auth.addPaymentMethod(user.userId, data);
  return ok({ method }, 201);
});

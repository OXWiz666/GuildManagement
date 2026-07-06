import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { updateUserSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const me = await services.auth.getCurrentUser(user.userId);
  return ok({ user: me });
});

export const PUT = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const data = updateUserSchema.parse(await readJson(req));
  const me = await services.auth.updateUserProfile(user.userId, data);
  return ok({ user: me });
});

import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { combatPowerSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const PUT = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const { cp } = combatPowerSchema.parse(await readJson(req));
  return ok(await services.auth.updateCombatPower(user.userId, cp));
});

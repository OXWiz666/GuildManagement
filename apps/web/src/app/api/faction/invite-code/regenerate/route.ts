import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const { ipAddress, userAgent } = getClientInfo(req);
  const result = await services.faction.regenerateFactionInviteCode(user.userId, ipAddress, userAgent);
  return ok(result);
});

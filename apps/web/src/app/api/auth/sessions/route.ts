import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const { ipAddress } = getClientInfo(req);
  const sessions = await services.auth.getUserSessions(user.userId, ipAddress);
  return ok({ sessions });
});

import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, okEmpty } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { clearRefreshCookie, getClientInfo } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const { ipAddress, userAgent } = getClientInfo(req);
  await services.auth.logoutAllDevices(user.userId, ipAddress, userAgent);

  const res = okEmpty();
  clearRefreshCookie(res);
  return res;
});

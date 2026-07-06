import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, okEmpty } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { clearRefreshCookie, getClientInfo, getRefreshToken, readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const body = await readJson<{ refreshToken?: string }>(req);
  const refreshToken = getRefreshToken(req) || body.refreshToken;

  if (refreshToken && typeof refreshToken === "string") {
    const { ipAddress, userAgent } = getClientInfo(req);
    await services.auth.logout(refreshToken, user.userId, ipAddress, userAgent);
  }

  const res = okEmpty();
  clearRefreshCookie(res);
  return res;
});

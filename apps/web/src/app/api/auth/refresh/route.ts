import type { NextRequest } from "next/server";
import { services, UnauthorizedError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { getClientInfo, getRefreshToken, readJson, setRefreshCookie } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const body = await readJson<{ refreshToken?: string }>(req);
  const refreshToken = getRefreshToken(req) || body.refreshToken;

  if (!refreshToken || typeof refreshToken !== "string") {
    throw new UnauthorizedError("No refresh token provided");
  }

  const { ipAddress, userAgent } = getClientInfo(req);
  const tokens = await services.auth.refreshTokens(refreshToken, ipAddress, userAgent);

  const res = ok({ accessToken: tokens.accessToken });
  setRefreshCookie(res, tokens.refreshToken);
  return res;
});

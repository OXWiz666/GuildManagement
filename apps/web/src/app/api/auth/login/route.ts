import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { loginSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { getClientInfo, readJson, setRefreshCookie } from "@/server/request";
import { authLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  authLimit(req);
  const data = loginSchema.parse(await readJson(req));
  const { ipAddress, userAgent } = getClientInfo(req);

  const result = await services.auth.login(
    data.email,
    data.password,
    ipAddress,
    userAgent,
  );

  const res = ok({ user: result.user, accessToken: result.tokens.accessToken });
  setRefreshCookie(res, result.tokens.refreshToken);
  return res;
});

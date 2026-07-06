import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { registerSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { getClientInfo, readJson, setRefreshCookie } from "@/server/request";
import { authLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  authLimit(req);
  const data = registerSchema.parse(await readJson(req));
  const { ipAddress, userAgent } = getClientInfo(req);

  const result = await services.auth.register(
    data.email,
    data.password,
    data.displayName,
    ipAddress,
    userAgent,
  );

  const res = ok(
    { user: result.user, accessToken: result.tokens.accessToken },
    201,
  );
  setRefreshCookie(res, result.tokens.refreshToken);
  return res;
});

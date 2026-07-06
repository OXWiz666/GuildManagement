import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { resetPasswordSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { getClientInfo, readJson } from "@/server/request";
import { authLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  authLimit(req);
  const data = resetPasswordSchema.parse(await readJson(req));
  const { ipAddress, userAgent } = getClientInfo(req);

  await services.auth.resetPassword(data.token, data.password, ipAddress, userAgent);

  return ok({
    message: "Password has been reset. Please log in with your new password.",
  });
});

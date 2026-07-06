import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { forgotPasswordSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { getClientInfo, readJson } from "@/server/request";
import { authLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  authLimit(req);
  const data = forgotPasswordSchema.parse(await readJson(req));
  const { ipAddress, userAgent } = getClientInfo(req);

  await services.auth.forgotPassword(data.email, ipAddress, userAgent);

  // Always return success to prevent email enumeration.
  return ok({
    message: "If an account with that email exists, a reset link has been sent.",
  });
});

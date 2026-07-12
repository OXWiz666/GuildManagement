import type { NextRequest } from "next/server";
import { services, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { authLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  authLimit(req);
  const email = req.nextUrl.searchParams.get("email");
  if (!email) throw new BadRequestError("email is required");
  const result = await services.auth.checkEmailRegistered(email);
  return ok(result);
});

import type { NextRequest } from "next/server";
import { services, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { authLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  authLimit(req);
  const username = req.nextUrl.searchParams.get("username");
  if (!username) throw new BadRequestError("username is required");
  const result = await services.auth.checkUsernameAvailable(username);
  return ok(result);
});

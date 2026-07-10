import type { NextRequest } from "next/server";
import { services, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const { code } = await readJson<{ code?: string }>(req);
  if (!code) throw new BadRequestError("An invite code is required");
  const { ipAddress, userAgent } = getClientInfo(req);
  const result = await services.faction.redeemFactionInviteCode(user.userId, code, ipAddress, userAgent);
  return ok(result);
});

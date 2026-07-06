import type { NextRequest } from "next/server";
import { services, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest) => {
  const user = requireAuth(req);
  const { guildId } = await readJson<{ guildId?: string }>(req);
  if (!guildId) throw new BadRequestError("guildId is required");
  const { ipAddress, userAgent } = getClientInfo(req);
  const result = await services.faction.inviteGuild(user.userId, guildId, ipAddress, userAgent);
  return ok(result);
});

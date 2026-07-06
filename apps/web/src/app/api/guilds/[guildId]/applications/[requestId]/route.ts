import type { NextRequest } from "next/server";
import { services, broadcastToGuild, BadRequestError } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/applications/[requestId]">) => {
    const { guildId, requestId } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const { action } = await readJson<{ action?: "ACCEPT" | "DECLINE" }>(req);

    if (action !== "ACCEPT" && action !== "DECLINE") {
      throw new BadRequestError("Action must be ACCEPT or DECLINE");
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    const result = await services.application.handleApplicationAction(
      guildId,
      requestId,
      action,
      user.userId,
      ipAddress,
      userAgent,
    );

    broadcastToGuild(guildId, "join_request_processed", {
      requestId,
      action,
      memberCode: result.memberCode,
    });

    return ok(result);
  },
);

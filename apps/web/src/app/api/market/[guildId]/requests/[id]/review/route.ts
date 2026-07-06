import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { reviewRequestSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/requests/[id]/review">) => {
    const { guildId, id } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const data = reviewRequestSchema.parse(await readJson(req));
    const { ipAddress, userAgent } = getClientInfo(req);
    const result = await services.requests.reviewRequest(
      guildId,
      id,
      user.userId,
      data.action,
      data.reviewNote,
      ipAddress,
      userAgent,
    );
    return ok(result);
  },
);

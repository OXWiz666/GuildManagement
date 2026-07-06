import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/invite/[code]">) => {
    requireAuth(req);
    const { code } = await ctx.params;
    const guild = await services.application.verifyInviteCode(code);
    return ok({ guild });
  },
);

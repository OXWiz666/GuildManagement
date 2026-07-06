import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/applications">) => {
    const { guildId } = await ctx.params;
    await requireGuildRole(req, "OFFICER", guildId);
    const applications = await services.application.getGuildApplications(guildId);
    return ok({ applications });
  },
);

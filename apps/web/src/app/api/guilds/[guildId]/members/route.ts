import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/members">) => {
    const { guildId } = await ctx.params;
    await requireGuildRole(req, "MEMBER", guildId);
    return ok({ members: await services.guild.getGuildMembers(guildId) });
  },
);

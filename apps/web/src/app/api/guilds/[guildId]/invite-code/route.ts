import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { getClientInfo } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/invite-code">) => {
    const { guildId } = await ctx.params;
    await requireGuildRole(req, "OFFICER", guildId);
    const inviteCode = await services.guild.getGuildInviteCode(guildId);
    return ok({ inviteCode });
  },
);

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/invite-code">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const { ipAddress, userAgent } = getClientInfo(req);
    const result = await services.application.generateGuildInviteCode(
      guildId,
      user.userId,
      ipAddress,
      userAgent,
    );
    broadcastToGuild(guildId, "invite_code_updated", { inviteCode: result.inviteCode });
    return ok(result);
  },
);

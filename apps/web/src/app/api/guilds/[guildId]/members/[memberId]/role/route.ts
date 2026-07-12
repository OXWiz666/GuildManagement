import type { NextRequest } from "next/server";
import { services, broadcastToGuild, BadRequestError } from "@guild/core";
import { GUILD_ROLES, type GuildRoleType } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/guilds/[guildId]/members/[memberId]/role">) => {
    const { guildId, memberId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const { role, customRoleId } = await readJson<{ role?: string; customRoleId?: string | null }>(req);

    if (!customRoleId && (!role || !GUILD_ROLES.includes(role as GuildRoleType))) {
      throw new BadRequestError(`Invalid role. Must be one of: ${GUILD_ROLES.join(", ")}`);
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    const updated = await services.guild.updateMemberRole(
      guildId,
      memberId,
      { role: role as GuildRoleType | undefined, customRoleId },
      user.userId,
      ipAddress,
      userAgent,
    );

    broadcastToGuild(guildId, "member_role_updated", updated);
    return ok({ member: updated });
  },
);

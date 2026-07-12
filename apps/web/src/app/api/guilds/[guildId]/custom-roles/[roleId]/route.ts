import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: { params: Promise<{ guildId: string; roleId: string }> }) => {
    const { guildId, roleId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const body = await readJson<{ name?: string; color?: string; sortOrder?: number }>(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    const role = await services.customRole.updateCustomRole(
      user.userId,
      guildId,
      roleId,
      body,
      ipAddress,
      userAgent,
    );

    broadcastToGuild(guildId, "custom_roles_updated", { guildId });
    // A rename changes affected members' rankName too — refresh the roster.
    broadcastToGuild(guildId, "member_role_updated", { guildId });
    return ok({ role });
  },
);

export const DELETE = withApi(
  async (req: NextRequest, ctx: { params: Promise<{ guildId: string; roleId: string }> }) => {
    const { guildId, roleId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const { ipAddress, userAgent } = getClientInfo(req);

    const result = await services.customRole.deleteCustomRole(
      user.userId,
      guildId,
      roleId,
      ipAddress,
      userAgent,
    );

    broadcastToGuild(guildId, "custom_roles_updated", { guildId });
    // A deleted role detaches from its members — refresh the roster too.
    broadcastToGuild(guildId, "member_role_updated", { guildId });
    return ok(result);
  },
);

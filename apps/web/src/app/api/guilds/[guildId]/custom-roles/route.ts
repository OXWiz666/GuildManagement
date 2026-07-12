import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: { params: Promise<{ guildId: string }> }) => {
    const { guildId } = await ctx.params;
    await requireGuildRole(req, "MEMBER", guildId);
    const roles = await services.customRole.listCustomRoles(guildId);
    return ok({ roles });
  },
);

export const POST = withApi(
  async (req: NextRequest, ctx: { params: Promise<{ guildId: string }> }) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const body = await readJson<{ name?: string; color?: string; band?: string }>(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    const role = await services.customRole.createCustomRole(
      user.userId,
      guildId,
      body,
      ipAddress,
      userAgent,
    );

    broadcastToGuild(guildId, "custom_roles_updated", { guildId });
    return ok({ role });
  },
);

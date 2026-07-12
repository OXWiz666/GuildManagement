import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: { params: Promise<{ guildId: string; categoryId: string }> }) => {
    const { guildId, categoryId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const body = await readJson<{ name?: string; color?: string; description?: string; sortOrder?: number }>(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    const category = await services.memberCategory.updateMemberCategory(
      user.userId,
      guildId,
      categoryId,
      body,
      ipAddress,
      userAgent,
    );

    broadcastToGuild(guildId, "member_categories_updated", { guildId });
    return ok({ category });
  },
);

export const DELETE = withApi(
  async (req: NextRequest, ctx: { params: Promise<{ guildId: string; categoryId: string }> }) => {
    const { guildId, categoryId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const { ipAddress, userAgent } = getClientInfo(req);

    const result = await services.memberCategory.deleteMemberCategory(
      user.userId,
      guildId,
      categoryId,
      ipAddress,
      userAgent,
    );

    broadcastToGuild(guildId, "member_categories_updated", { guildId });
    // A deleted category detaches from its members — refresh the roster too.
    broadcastToGuild(guildId, "member_role_updated", { guildId });
    return ok(result);
  },
);

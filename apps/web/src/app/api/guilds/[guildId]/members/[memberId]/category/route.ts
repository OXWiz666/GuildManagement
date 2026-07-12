import type { NextRequest } from "next/server";
import { services, broadcastToGuild } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { getClientInfo, readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: { params: Promise<{ guildId: string; memberId: string }> }) => {
    const { guildId, memberId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const { categoryId } = await readJson<{ categoryId?: string | null }>(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    const member = await services.memberCategory.assignMemberCategory(
      user.userId,
      guildId,
      memberId,
      categoryId ?? null,
      ipAddress,
      userAgent,
    );

    broadcastToGuild(guildId, "member_role_updated", member);
    return ok({ member });
  },
);

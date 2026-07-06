import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { prioritySequenceSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/priority/[memberId]">) => {
    const { guildId, memberId } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const data = prioritySequenceSchema.parse(await readJson(req));
    const member = await services.market.overridePrioritySeq(
      guildId,
      memberId,
      user.userId,
      data.prioritySeq,
      data.reason,
    );
    return ok({ member });
  },
);

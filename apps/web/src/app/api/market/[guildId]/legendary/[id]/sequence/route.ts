import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { legendarySequenceSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/legendary/[id]/sequence">) => {
    const { guildId, id } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const data = legendarySequenceSchema.parse(await readJson(req));
    const request = await services.market.setLegendarySequence(
      guildId,
      id,
      user.userId,
      data.prioritySeq,
    );
    return ok({ request });
  },
);

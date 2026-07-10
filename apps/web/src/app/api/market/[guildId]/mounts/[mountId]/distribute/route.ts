import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { distributeMountSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/mounts/[mountId]/distribute">) => {
    const { guildId, mountId } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const data = distributeMountSchema.parse(await readJson(req));
    const record = await services.mounts.distributeMount(guildId, user.userId, { ...data, mountId });
    return ok({ record }, 201);
  },
);

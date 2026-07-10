import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { mountCatalogSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const PATCH = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/mounts/[mountId]">) => {
    const { guildId, mountId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const data = mountCatalogSchema.parse(await readJson(req));
    const mount = await services.mounts.upsertMount(guildId, user.userId, { ...data, id: mountId });
    return ok({ mount });
  },
);

export const DELETE = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/mounts/[mountId]">) => {
    const { guildId, mountId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    return ok(await services.mounts.deleteMount(guildId, user.userId, mountId));
  },
);

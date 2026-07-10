import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { mountCatalogSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/mounts">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    const mounts = await services.mounts.listMounts(guildId, user.userId);
    return ok({ mounts });
  },
);

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/mounts">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "GUILD_LEADER", guildId);
    const data = mountCatalogSchema.parse(await readJson(req));
    const mount = await services.mounts.upsertMount(guildId, user.userId, data);
    return ok({ mount }, 201);
  },
);

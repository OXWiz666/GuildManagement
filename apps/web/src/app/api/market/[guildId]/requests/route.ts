import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { createItemRequestSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/requests">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    const data = createItemRequestSchema.parse(await readJson(req));
    const request = await services.requests.createItemRequest(guildId, user.userId, data);
    return ok({ request }, 201);
  },
);

export const GET = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/market/[guildId]/requests">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "OFFICER", guildId);
    const sp = req.nextUrl.searchParams;
    const result = await services.requests.getGuildRequests(guildId, user.userId, {
      status: sp.get("status") ?? undefined,
      type: sp.get("type") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return ok(result);
  },
);

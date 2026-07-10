import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePlatformAdmin(req);
  const { id } = await ctx.params;
  return ok(await services.adminGuilds.getGuildDetail(id));
});

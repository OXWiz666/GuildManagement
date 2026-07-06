import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { uploadScreenshotSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requireGuildRole } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(
  async (req: NextRequest, ctx: RouteContext<"/api/equipment/[guildId]/screenshot">) => {
    const { guildId } = await ctx.params;
    const { user } = await requireGuildRole(req, "MEMBER", guildId);
    const data = uploadScreenshotSchema.parse({ ...(await readJson(req)), guildId });
    const result = await services.equipment.uploadScreenshot(data.guildId, user.userId, data.dataUrl);
    return ok(result, 201);
  },
);

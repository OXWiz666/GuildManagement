import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { userModerationSchema } from "@guild/shared";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";
import { readJson } from "@/server/request";

export const runtime = "nodejs";

export const POST = withApi(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requirePlatformAdmin(req, "ADMIN");
  const { id } = await ctx.params;
  const data = userModerationSchema.parse(await readJson(req));
  return ok(
    await services.adminUsers.moderateUser(user.userId, id, data.action, {
      days: data.days,
      reason: data.reason,
    }),
  );
});

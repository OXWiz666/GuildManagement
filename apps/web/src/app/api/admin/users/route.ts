import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  await requirePlatformAdmin(req);
  const sp = new URL(req.url).searchParams;
  const res = await services.adminUsers.listUsers({
    search: sp.get("search") || undefined,
    status: (sp.get("status") as never) || undefined,
    page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
  });
  return ok(res);
});

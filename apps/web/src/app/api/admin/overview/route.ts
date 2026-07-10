import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requirePlatformAdmin } from "@/server/guards";

export const runtime = "nodejs";

// Platform-wide overview metrics (Phase 1). Gated to platform admins.
export const GET = withApi(async (req: NextRequest) => {
  await requirePlatformAdmin(req);
  const overview = await services.platform.getPlatformOverview();
  return ok(overview);
});

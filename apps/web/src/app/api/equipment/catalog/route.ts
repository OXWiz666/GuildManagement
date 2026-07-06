import type { NextRequest } from "next/server";
import { services } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  requireAuth(req);
  return ok(await services.equipment.getCatalog());
});

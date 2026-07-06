import type { NextRequest } from "next/server";
import { services, cache } from "@guild/core";
import { withApi, ok } from "@/server/respond";
import { requireAuth } from "@/server/guards";

export const runtime = "nodejs";

export const GET = withApi(async (req: NextRequest) => {
  requireAuth(req);
  const cacheKey = "bosses:registry";

  const cached = await cache.get<unknown>(cacheKey);
  if (cached) return ok(cached);

  const bosses = await services.dashboard.getBosses();
  const data = { bosses };
  await cache.set(cacheKey, data, 300);
  return ok(data);
});

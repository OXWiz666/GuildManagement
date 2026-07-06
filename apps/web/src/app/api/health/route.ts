import { getCacheStats } from "@guild/core";
import { withApi, ok } from "@/server/respond";

export const runtime = "nodejs";

export const GET = withApi(async () =>
  ok({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.0.1",
    service: "guild-management-api",
    uptimeSeconds: Math.round(process.uptime()),
    cache: getCacheStats(),
  }),
);

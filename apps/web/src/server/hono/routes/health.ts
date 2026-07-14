import { Hono } from "hono";
import { getCacheStats } from "@guild/core";
import type { AppEnv } from "../env";
import { ok } from "../respond";

/** Health probe — Hono port of apps/web/src/app/api/health. Unauthenticated. */
export const health = new Hono<AppEnv>().get("/", async (c) =>
  ok(c, {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.0.1",
    service: "guild-management-api",
    uptimeSeconds: Math.round(process.uptime()),
    cache: getCacheStats(),
  }),
);

import { Hono } from "hono";
import { compress } from "hono/compress";
import type { AppEnv } from "./env";
import { onError } from "./respond";
import { market } from "./routes/market";
import { activities } from "./routes/activities";
import { notifications } from "./routes/notifications";
import { equipment } from "./routes/equipment";
import { guilds } from "./routes/guilds";
import { faction } from "./routes/faction";
import { auth } from "./routes/auth";
import { admin } from "./routes/admin";
import { dashboard } from "./routes/dashboard";
import { onboarding } from "./routes/onboarding";
import { discord } from "./routes/discord";
import { health } from "./routes/health";

/**
 * Root Hono application for the API, mounted at `/api` via the catch-all route
 * handler in apps/web/src/app/api/[[...route]]/route.ts. It replaced the 145
 * file-based route handlers after byte-for-byte parity was verified.
 *
 * `AppType` is the source of truth for the type-safe RPC client (`hc<AppType>`).
 * Routes are registered per-domain so the client can be built per-domain, which
 * keeps Hono RPC's recursive path types from exploding at large route counts.
 */
const app = new Hono<AppEnv>().basePath("/api");

app.onError(onError);
// gzip/deflate every response — Node runtime only (mandatory here, see the
// catch-all route handler), since compress() relies on Node's zlib streams.
app.use(compress());

const routes = app
  .route("/market", market)
  .route("/activities", activities)
  .route("/notifications", notifications)
  .route("/equipment", equipment)
  .route("/guilds", guilds)
  .route("/faction", faction)
  .route("/auth", auth)
  .route("/admin", admin)
  .route("/dashboard", dashboard)
  .route("/onboarding", onboarding)
  .route("/discord", discord)
  .route("/health", health);

export type AppType = typeof routes;
export type MarketType = typeof market;
export type ActivitiesType = typeof activities;
export type NotificationsType = typeof notifications;
export type EquipmentType = typeof equipment;
export type GuildsType = typeof guilds;
export type FactionType = typeof faction;
export type AuthType = typeof auth;
export type AdminType = typeof admin;
export type DashboardType = typeof dashboard;
export type OnboardingType = typeof onboarding;
export type DiscordType = typeof discord;
export type HealthType = typeof health;
export { app };

// ─────────────────────────────────────────────────────────────
// @guild/core — framework-agnostic backend logic.
// Consumed by the Next.js route handlers in apps/web/src/app/api
// via the thin adapters in apps/web/src/server. Never imported by
// client components.
// ─────────────────────────────────────────────────────────────

// ─── Services (grouped namespace) ───────────────
import * as activity from "./services/activity.service";
import * as activityPoints from "./services/activityPoints.service";
import * as application from "./services/application.service";
import * as auction from "./services/auction.service";
import * as bossCommitment from "./services/bossCommitment.service";
import * as audit from "./services/audit.service";
import * as auditLog from "./services/audit-log.service";
import * as auth from "./services/auth.service";
import * as customRole from "./services/customRole.service";
import * as dashboard from "./services/dashboard.service";
import * as discordLink from "./services/discordLink.service";
import * as equipment from "./services/equipment.service";
import * as faction from "./services/faction.service";
import * as factionAudit from "./services/factionAudit.service";
import * as guild from "./services/guild.service";
import * as ledger from "./services/ledger.service";
import * as loot from "./services/loot.service";
import * as market from "./services/market.service";
import * as mounts from "./services/mounts.service";
import * as notification from "./services/notification.service";
import * as onboarding from "./services/onboarding.service";
import * as platform from "./services/platform.service";
import * as storage from "./services/storage.service";
import * as adminUsers from "./services/admin-users.service";
import * as adminGuilds from "./services/admin-guilds.service";
import * as billing from "./services/billing.service";
import * as requests from "./services/requests.service";

export const services = {
  activity,
  activityPoints,
  application,
  auction,
  bossCommitment,
  audit,
  auditLog,
  auth,
  customRole,
  dashboard,
  discordLink,
  equipment,
  faction,
  factionAudit,
  guild,
  ledger,
  loot,
  market,
  mounts,
  notification,
  onboarding,
  platform,
  storage,
  adminUsers,
  adminGuilds,
  billing,
  requests,
};

// ─── Config ─────────────────────────────────────
export { env } from "./config/env";
export type { Env } from "./config/env";

// ─── Errors ─────────────────────────────────────
export {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  BadRequestError,
} from "./utils/errors";

// ─── JWT / token utils ──────────────────────────
export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  generateRandomToken,
  parseExpiryToMs,
} from "./utils/jwt";

// ─── Pagination utils ───────────────────────────
export * from "./utils/pagination";

// ─── Cache ──────────────────────────────────────
// `cache` (in-memory) is the existing engine every service currently uses.
// `redisCache` is the Upstash-backed layer from /docs/redis-caching-design.md
// — exported under its own name so migrating a call site is an explicit
// opt-in, not a silent behavior change for everyone importing `cache`.
export { cache, getCacheStats } from "./lib/cache";
export { cache as redisCache, isRedisConfigured } from "./lib/redis";
export { cacheKeys, ttl as cacheTtl } from "./lib/cache-keys";

// ─── Realtime broadcasting ──────────────────────
export { broadcastToGuild, broadcastToUser, broadcastToFaction } from "./lib/socket";

// ─── Storage ────────────────────────────────────
export * from "./lib/supabaseStorage";

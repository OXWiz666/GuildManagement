// ─────────────────────────────────────────────────────────────
// @guild/core — framework-agnostic backend logic.
// Consumed by the Next.js route handlers in apps/web/src/app/api
// via the thin adapters in apps/web/src/server. Never imported by
// client components.
// ─────────────────────────────────────────────────────────────

// ─── Services (grouped namespace) ───────────────
import * as activity from "./services/activity.service";
import * as application from "./services/application.service";
import * as auction from "./services/auction.service";
import * as audit from "./services/audit.service";
import * as auditLog from "./services/audit-log.service";
import * as auth from "./services/auth.service";
import * as customRole from "./services/customRole.service";
import * as dashboard from "./services/dashboard.service";
import * as equipment from "./services/equipment.service";
import * as faction from "./services/faction.service";
import * as guild from "./services/guild.service";
import * as ledger from "./services/ledger.service";
import * as loot from "./services/loot.service";
import * as market from "./services/market.service";
import * as mounts from "./services/mounts.service";
import * as notification from "./services/notification.service";
import * as onboarding from "./services/onboarding.service";
import * as platform from "./services/platform.service";
import * as adminUsers from "./services/admin-users.service";
import * as adminGuilds from "./services/admin-guilds.service";
import * as billing from "./services/billing.service";
import * as requests from "./services/requests.service";

export const services = {
  activity,
  application,
  auction,
  audit,
  auditLog,
  auth,
  customRole,
  dashboard,
  equipment,
  faction,
  guild,
  ledger,
  loot,
  market,
  mounts,
  notification,
  onboarding,
  platform,
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
export { cache, getCacheStats } from "./lib/cache";

// ─── Realtime broadcasting ──────────────────────
export { broadcastToGuild, broadcastToUser, broadcastToFaction } from "./lib/socket";

// ─── Storage ────────────────────────────────────
export * from "./lib/supabaseStorage";

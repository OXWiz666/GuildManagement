import { prisma } from "@guild/db";
import { ForbiddenError } from "../utils/errors";
import { hasMinimumPlatformRole, type PlatformRoleType } from "@guild/shared";
import { getBillingOverview } from "./billing.service";

// ─── Platform Admin (SaaS-level) ─────────────────────────────────────
// Phase 0: identity + authorization only. Dashboards/modules land in later phases.

export type PlatformAdminRecord = {
  id: string;
  userId: string;
  role: PlatformRoleType;
  permissions: unknown;
  isActive: boolean;
  lastLoginAt: Date | null;
};

/** Fetch the caller's platform-admin record, or null if they are not one. */
export async function getPlatformAdminByUser(userId: string) {
  return prisma.platformAdmin.findUnique({ where: { userId } });
}

/**
 * Assert the user is an active platform admin meeting `minRole`.
 * Returns the record; throws ForbiddenError otherwise. Used by the web guard.
 */
export async function requirePlatformAdmin(
  userId: string,
  minRole: PlatformRoleType = "SUPPORT",
) {
  const admin = await getPlatformAdminByUser(userId);
  if (!admin || !admin.isActive) {
    throw new ForbiddenError("Platform admin access required");
  }
  if (!hasMinimumPlatformRole(admin.role as PlatformRoleType, minRole)) {
    throw new ForbiddenError(
      `Insufficient platform permissions. Required: ${minRole}, yours: ${admin.role}`,
    );
  }
  return admin;
}

/** Public-safe projection of a platform admin for the client. */
export function toPlatformAdminPublic(admin: {
  role: string;
  permissions: unknown;
  lastLoginAt: Date | null;
}) {
  return {
    role: admin.role as PlatformRoleType,
    permissions: Array.isArray(admin.permissions) ? (admin.permissions as string[]) : [],
    lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.toISOString() : null,
  };
}

// ─── Platform Overview (Phase 1) ─────────────────────────────────────
// Metrics derived entirely from existing data. Billing metrics stay null
// until the subscription/payment models land in a later phase.

export interface OverviewSeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface PlatformOverview {
  cards: {
    totalUsers: number;
    activeUsersToday: number;
    onlineUsers: number;
    activeSessions: number;
    totalGuilds: number;
    activeGuilds: number;
    auditEventsToday: number;
    // Billing — not configured yet (Phase 4)
    premiumGuilds: number | null;
    freeGuilds: number | null;
    activeSubscriptions: number | null;
    totalRevenue: number | null;
    monthlyRevenue: number | null;
    pendingPayments: number | null;
    failedPayments: number | null;
  };
  charts: {
    userGrowth: OverviewSeriesPoint[]; // new users/day, 30d
    guildGrowth: OverviewSeriesPoint[]; // new guilds/day, 30d
    loginActivity: OverviewSeriesPoint[]; // logins/day, 14d
  };
  generatedAt: string;
}

/** Fill a sparse day-bucketed result into a continuous series ending today. */
function fillDays(rows: Array<{ d: Date; c: number | bigint }>, days: number): OverviewSeriesPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(new Date(r.d).toISOString().slice(0, 10), Number(r.c));
  }
  const out: OverviewSeriesPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() - i);
    const key = dt.toISOString().slice(0, 10);
    out.push({ date: key, value: map.get(key) ?? 0 });
  }
  return out;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const first = <T>(rows: Array<{ c: T }>): T => rows[0]?.c as T;

  const [
    totalUsers,
    totalGuilds,
    activeGuilds,
    auditEventsToday,
    activeSessions,
    activeUsersTodayRows,
    onlineUsersRows,
    userGrowthRows,
    guildGrowthRows,
    loginRows,
    billing,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.guild.count(),
    prisma.guild.count({ where: { isActive: true } }),
    prisma.auditLog.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.session.count({ where: { lastActive: { gte: dayAgo } } }),
    prisma.$queryRaw<Array<{ c: number }>>`
      SELECT count(DISTINCT user_id)::int AS c FROM sessions WHERE last_active >= ${startOfToday}`,
    prisma.$queryRaw<Array<{ c: number }>>`
      SELECT count(DISTINCT user_id)::int AS c FROM sessions WHERE last_active >= ${fiveMinAgo}`,
    prisma.$queryRaw<Array<{ d: Date; c: number }>>`
      SELECT date_trunc('day', created_at) AS d, count(*)::int AS c
      FROM users WHERE created_at >= ${since30} GROUP BY d ORDER BY d`,
    prisma.$queryRaw<Array<{ d: Date; c: number }>>`
      SELECT date_trunc('day', created_at) AS d, count(*)::int AS c
      FROM guilds WHERE created_at >= ${since30} GROUP BY d ORDER BY d`,
    prisma.$queryRaw<Array<{ d: Date; c: number }>>`
      SELECT date_trunc('day', created_at) AS d, count(*)::int AS c
      FROM audit_logs WHERE action = 'USER_LOGIN' AND created_at >= ${since14} GROUP BY d ORDER BY d`,
    getBillingOverview(),
  ]);

  return {
    cards: {
      totalUsers,
      activeUsersToday: first(activeUsersTodayRows) ?? 0,
      onlineUsers: first(onlineUsersRows) ?? 0,
      activeSessions,
      totalGuilds,
      activeGuilds,
      auditEventsToday,
      premiumGuilds: billing.premiumGuilds,
      freeGuilds: billing.freeGuilds,
      activeSubscriptions: billing.activeSubscriptions,
      totalRevenue: billing.totalRevenue,
      monthlyRevenue: billing.monthlyRevenue,
      pendingPayments: billing.pendingPayments,
      failedPayments: billing.failedPayments,
    },
    charts: {
      userGrowth: fillDays(userGrowthRows, 30),
      guildGrowth: fillDays(guildGrowthRows, 30),
      loginActivity: fillDays(loginRows, 14),
    },
    generatedAt: now.toISOString(),
  };
}

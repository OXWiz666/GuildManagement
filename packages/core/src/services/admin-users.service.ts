import bcrypt from "bcryptjs";
import { prisma } from "@guild/db";
import { env } from "../config/env";
import { writeAuditLog } from "./audit.service";
import { NotFoundError, BadRequestError } from "../utils/errors";

// ─── Platform User Management (Phase 2) ──────────────────────────────
// Super-admin-facing moderation over ALL users (not guild-scoped).

export type UserStatus = "active" | "banned" | "suspended" | "deleted";

function deriveStatus(u: {
  deletedAt: Date | null;
  bannedAt: Date | null;
  suspendedUntil: Date | null;
}): UserStatus {
  if (u.deletedAt) return "deleted";
  if (u.bannedAt) return "banned";
  if (u.suspendedUntil && u.suspendedUntil.getTime() > Date.now()) return "suspended";
  return "active";
}

export async function listUsers(opts: {
  search?: string;
  status?: UserStatus;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  const take = Math.min(opts.limit || 25, 100);
  const now = new Date();

  const where: any = {};
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    where.OR = [
      { email: { contains: s, mode: "insensitive" } },
      { displayName: { contains: s, mode: "insensitive" } },
      { ign: { contains: s, mode: "insensitive" } },
    ];
  }
  switch (opts.status) {
    case "deleted":
      where.deletedAt = { not: null };
      break;
    case "banned":
      where.bannedAt = { not: null };
      where.deletedAt = null;
      break;
    case "suspended":
      where.suspendedUntil = { gt: now };
      where.deletedAt = null;
      where.bannedAt = null;
      break;
    case "active":
      where.deletedAt = null;
      where.bannedAt = null;
      where.OR = where.OR;
      where.AND = [{ OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }] }];
      break;
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
        emailVerifiedAt: true,
        bannedAt: true,
        suspendedUntil: true,
        deletedAt: true,
        _count: { select: { guildMembers: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      createdAt: u.createdAt.toISOString(),
      emailVerified: !!u.emailVerifiedAt,
      status: deriveStatus(u),
      suspendedUntil: u.suspendedUntil ? u.suspendedUntil.toISOString() : null,
      guildCount: u._count.guildMembers,
    })),
    pagination: { page, limit: take, total, totalPages: Math.ceil(total / take) },
  };
}

export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      guildMembers: {
        include: { guild: { select: { id: true, name: true, slug: true } } },
      },
      sessions: { orderBy: { lastActive: "desc" }, take: 20 },
      loginEvents: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!user) throw new NotFoundError("User not found");

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    ign: user.ign,
    cp: user.cp,
    createdAt: user.createdAt.toISOString(),
    emailVerified: !!user.emailVerifiedAt,
    status: deriveStatus(user),
    bannedAt: user.bannedAt?.toISOString() ?? null,
    suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
    deletedAt: user.deletedAt?.toISOString() ?? null,
    guilds: user.guildMembers.map((m) => ({
      guildId: m.guild.id,
      guildName: m.guild.name,
      guildSlug: m.guild.slug,
      role: m.role,
      rankName: m.rankName,
      isActive: m.isActive,
    })),
    sessions: user.sessions.map((s) => ({
      id: s.id,
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      lastActive: s.lastActive.toISOString(),
    })),
    loginEvents: user.loginEvents.map((e) => ({
      id: e.id,
      success: e.success,
      ipAddress: e.ipAddress,
      device: e.device,
      browser: e.browser,
      os: e.os,
      country: e.country,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export type UserModerationAction =
  | "ban"
  | "unban"
  | "suspend"
  | "unsuspend"
  | "soft_delete"
  | "restore"
  | "verify_email";

export async function moderateUser(
  actorId: string,
  userId: string,
  action: UserModerationAction,
  opts?: { days?: number; reason?: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User not found");

  const data: Record<string, unknown> = {};
  switch (action) {
    case "ban":
      data["bannedAt"] = new Date();
      data["isActive"] = false;
      break;
    case "unban":
      data["bannedAt"] = null;
      data["isActive"] = true;
      break;
    case "suspend": {
      const days = opts?.days && opts.days > 0 ? opts.days : 7;
      data["suspendedUntil"] = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      break;
    }
    case "unsuspend":
      data["suspendedUntil"] = null;
      break;
    case "soft_delete":
      data["deletedAt"] = new Date();
      data["isActive"] = false;
      break;
    case "restore":
      data["deletedAt"] = null;
      data["bannedAt"] = null;
      data["isActive"] = true;
      break;
    case "verify_email":
      data["emailVerifiedAt"] = new Date();
      break;
    default:
      throw new BadRequestError("Unknown moderation action");
  }

  await prisma.user.update({ where: { id: userId }, data });

  // Ban / delete also terminate all active sessions.
  if (action === "ban" || action === "soft_delete") {
    await Promise.all([
      prisma.session.deleteMany({ where: { userId } }),
      prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } }),
    ]);
  }

  await writeAuditLog({
    actorId,
    action: `ADMIN_USER_${action.toUpperCase()}`,
    target: "User",
    targetId: userId,
    detail: { email: user.email, reason: opts?.reason, days: opts?.days },
  });

  return { id: userId, action };
}

export async function forceLogoutUser(actorId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new NotFoundError("User not found");

  const [sessions] = await Promise.all([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } }),
  ]);

  await writeAuditLog({
    actorId,
    action: "ADMIN_USER_FORCE_LOGOUT",
    target: "User",
    targetId: userId,
    detail: { email: user.email, sessionsCleared: sessions.count },
  });
  return { sessionsCleared: sessions.count };
}

export async function resetUserPassword(actorId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new NotFoundError("User not found");

  // Generate a random temporary password, hash it, and return the plaintext ONCE.
  const tempPassword = `Tmp-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const passwordHash = await bcrypt.hash(tempPassword, env.BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } });

  await writeAuditLog({
    actorId,
    action: "ADMIN_USER_PASSWORD_RESET",
    target: "User",
    targetId: userId,
    detail: { email: user.email },
  });
  return { tempPassword };
}

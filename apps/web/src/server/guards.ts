import type { NextRequest } from "next/server";
import {
  verifyAccessToken,
  services,
  UnauthorizedError,
  ForbiddenError,
} from "@guild/core";
import { hasMinimumRole, type GuildRoleType, type JwtPayload, type PlatformRoleType } from "@guild/shared";
import type { GuildMember, PlatformAdmin } from "@guild/db";
import { ACCESS_COOKIE } from "./request";

/** Extract a bearer token from the Authorization header or the access cookie. */
function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies.get(ACCESS_COOKIE)?.value ?? null;
}

/**
 * Require a valid JWT access token. Returns the decoded payload.
 * Port of the Express `requireAuth` middleware.
 */
export function requireAuth(req: NextRequest): JwtPayload {
  const token = extractToken(req);
  if (!token) {
    throw new UnauthorizedError("No authentication token provided");
  }

  try {
    return verifyAccessToken(token);
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "TokenExpiredError") {
      throw new UnauthorizedError("Access token expired");
    }
    if (name === "JsonWebTokenError") {
      throw new UnauthorizedError("Invalid access token");
    }
    throw new UnauthorizedError("Authentication failed");
  }
}

/**
 * Require the caller to be a member of `guildId` with at least `minimumRole`.
 * Returns both the decoded user and their guild membership.
 * Port of the Express `requireGuildRole` middleware — authorization is per-guild.
 */
export async function requireGuildRole(
  req: NextRequest,
  minimumRole: GuildRoleType,
  guildId: string,
): Promise<{ user: JwtPayload; membership: GuildMember }> {
  const user = requireAuth(req);

  if (!guildId) {
    throw new ForbiddenError("Guild context required for this action");
  }

  const membership = await services.guild.getGuildMemberByUser(user.userId, guildId);

  if (!membership || !membership.isActive) {
    throw new ForbiddenError("You are not a member of this guild");
  }

  if (!hasMinimumRole(membership.role as GuildRoleType, minimumRole)) {
    throw new ForbiddenError(
      `Insufficient permissions. Required: ${minimumRole}, yours: ${membership.role}`,
    );
  }

  return { user, membership };
}

/**
 * Require the caller to be an active platform admin with at least `minRole`.
 * Authorization is platform-wide (SaaS-level), NOT per-guild — gates the
 * Super Admin area and all `/api/admin/**` routes.
 */
export async function requirePlatformAdmin(
  req: NextRequest,
  minRole: PlatformRoleType = "SUPPORT",
): Promise<{ user: JwtPayload; admin: PlatformAdmin }> {
  const user = requireAuth(req);
  const admin = await services.platform.requirePlatformAdmin(user.userId, minRole);
  return { user, admin: admin as PlatformAdmin };
}

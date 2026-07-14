import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import {
  verifyAccessToken,
  services,
  UnauthorizedError,
  ForbiddenError,
} from "@guild/core";
import {
  hasMinimumRole,
  type GuildRoleType,
  type JwtPayload,
  type PlatformRoleType,
} from "@guild/shared";
import type { PlatformAdmin } from "@guild/db";
import type { AppEnv } from "../env";

const ACCESS_COOKIE = "accessToken";

/** Extract a bearer token from the Authorization header or the access cookie. */
function extractToken(c: Context): string | null {
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return getCookie(c, ACCESS_COOKIE) ?? null;
}

/**
 * Verify the request's JWT access token and return the decoded payload.
 * Port of the previous `requireAuth` guard.
 */
function authenticate(c: Context): JwtPayload {
  const token = extractToken(c);
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

/** Require a valid JWT; sets `user` on the context. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", authenticate(c));
  await next();
};

/**
 * Require the caller to be a member of the route's `:guildId` with at least
 * `minimumRole`. Sets both `user` and `membership` on the context. Port of the
 * previous `requireGuildRole` guard — authorization is per-guild.
 */
export const requireGuildRole = (
  minimumRole: GuildRoleType,
): MiddlewareHandler<AppEnv> => async (c, next) => {
  const user = authenticate(c);
  const guildId = c.req.param("guildId");

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

  c.set("user", user);
  c.set("membership", membership);
  await next();
};

/**
 * Require the caller to be an active platform admin with at least `minRole`.
 * Authorization is platform-wide (SaaS-level), NOT per-guild. Sets `user` and
 * `admin` on the context. Port of the previous `requirePlatformAdmin` guard.
 */
export const requirePlatformAdmin = (
  minRole: PlatformRoleType = "SUPPORT",
): MiddlewareHandler<AppEnv> => async (c, next) => {
  const user = authenticate(c);
  const admin = await services.platform.requirePlatformAdmin(user.userId, minRole);
  c.set("user", user);
  c.set("admin", admin as PlatformAdmin);
  await next();
};

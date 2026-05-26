import type { Request, Response, NextFunction } from "express";
import { prisma } from "@guild/db";
import { hasMinimumRole, type GuildRoleType } from "@guild/shared";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import type { GuildMember } from "@guild/db";

// Extend Express Request to include guild membership
declare global {
  namespace Express {
    interface Request {
      membership?: GuildMember;
    }
  }
}

/**
 * Middleware factory that requires a minimum guild role.
 * Must be used AFTER requireAuth — needs req.user.
 *
 * Reads guildId from params, query, or body.
 * Authorization is per-guild: a user may be leader in one and recruit in another.
 */
export function requireGuildRole(minimumRole: GuildRoleType) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required");
      }

      // Extract guildId from multiple possible locations
      const rawGuildId =
        req.params['guildId'] ||
        (req.body as Record<string, unknown>)?.[ 'guildId'] ||
        req.query['guildId'];

      const guildId = typeof rawGuildId === "string" ? rawGuildId : undefined;

      if (!guildId) {
        throw new ForbiddenError("Guild context required for this action");
      }

      // Look up the user's membership in this specific guild
      const membership = await prisma.guildMember.findUnique({
        where: {
          userId_guildId: {
            userId: req.user.userId,
            guildId,
          },
        },
      });

      if (!membership || !membership.isActive) {
        throw new ForbiddenError("You are not a member of this guild");
      }

      // Check role hierarchy
      if (!hasMinimumRole(membership.role as GuildRoleType, minimumRole)) {
        throw new ForbiddenError(
          `Insufficient permissions. Required: ${minimumRole}, yours: ${membership.role}`,
        );
      }

      // Attach membership to request for downstream use
      req.membership = membership;
      next();
    } catch (error) {
      next(error);
    }
  };
}

import { ROLE_DISPLAY_NAMES, hasMinimumRole, type GuildRoleType } from "@guild/shared";
import type { Actor, Command } from "../types/command.js";
import { MissingPermissionError, NotLinkedError } from "../utils/errors.js";

/**
 * Command-level authorization.
 *
 * IMPORTANT — this is a UX gate, not the security boundary. It exists so a
 * member gets "you need Officer" instead of a raw ForbiddenError. The real
 * enforcement is inside the @guild/core services, which re-check the actor's
 * role against the database on every call. If this check and the service ever
 * disagree, the service wins — which is the safe direction.
 *
 * It reuses `hasMinimumRole` from @guild/shared rather than re-deriving the
 * hierarchy, so bot and website can never disagree about what an Officer is.
 */
export function assertCommandAllowed(command: Command, actor: Actor | null): asserts actor is Actor {
  if (command.requiresLink && !actor) {
    throw new NotLinkedError();
  }

  if (!actor) {
    throw new NotLinkedError();
  }

  if (command.minimumRole && !hasMinimumRole(actor.role, command.minimumRole)) {
    throw new MissingPermissionError(
      ROLE_DISPLAY_NAMES[command.minimumRole],
      ROLE_DISPLAY_NAMES[actor.role] ?? actor.role,
    );
  }
}

/** Non-throwing variant, for `!commands` to decide what to list. */
export function canRun(command: Command, actor: Actor | null): boolean {
  if (command.requiresLink && !actor) return false;
  if (!command.minimumRole) return true;
  if (!actor) return false;
  return hasMinimumRole(actor.role, command.minimumRole);
}

/**
 * Roles allowed to perform boss-rotation writes and bot configuration.
 * Mirrors the website's own boss-management tier (OFFICER and above).
 */
export const OFFICER_MINIMUM: GuildRoleType = "OFFICER";
